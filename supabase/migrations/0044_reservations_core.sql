-- Kuik — reservations, properly
--
-- The table has existed since 0032, but three things were missing and one was
-- actively wrong:
--   * no absolute instant, so "is it today" was answered in UTC and the
--     hostess lost tonight's bookings from 18:00 Mexico time onward;
--   * no capacity model, so the bot could never know if 8pm Saturday was free;
--   * no single write path, so the public route skipped every setting the
--     dashboard offered (reservations_enabled included);
--   * no realtime, so a new request sat unseen until someone reloaded.
--
-- Everything here is additive with defaults that reproduce today's behaviour:
-- a tenant with no areas configured books exactly as it does now.

-- ── Areas ──────────────────────────────────────────────────────────────────
-- "Salón", "Terraza", "Salón privado". Capacity lives here rather than on the
-- tenant because the whole point of a private room is that it fills separately.
create table if not exists reservation_areas (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants on delete cascade,
  branch_id       uuid references branches on delete cascade,
  name            text not null,
  -- Max diners seated in this area within one slot. NULL = unlimited, which is
  -- also what every existing tenant gets by having no areas at all.
  max_covers      int,
  -- An area the public may request. A private room is often negotiated by
  -- phone only, so it can be staff-bookable while hidden from the menu form.
  public_bookable boolean not null default true,
  position        int not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists reservation_areas_tenant_idx
  on reservation_areas (tenant_id, position);

alter table reservation_areas enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies
    where tablename = 'reservation_areas' and policyname = 'reservation_areas_read') then
    create policy reservation_areas_read on reservation_areas for select
      using (public.is_member(tenant_id) or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies
    where tablename = 'reservation_areas' and policyname = 'reservation_areas_write') then
    create policy reservation_areas_write on reservation_areas for all
      using (public.can_manage_menu(tenant_id) or public.is_super_admin())
      with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- ── Reservation columns ────────────────────────────────────────────────────
alter table reservations
  -- Where it came from. Mirrors orders.channel, which already tags 'whatsapp'.
  add column if not exists source text not null default 'form',
  add column if not exists area_id uuid references reservation_areas on delete set null,
  -- THE column. Turns every "has it passed / is it tomorrow / remind me 24h
  -- before" question into a plain timestamptz comparison, in SQL and in TS,
  -- with no offset arithmetic and no DST special cases anywhere.
  add column if not exists starts_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_source_check') then
    alter table reservations add constraint reservations_source_check
      check (source in ('form', 'manual', 'bot', 'phone'));
  end if;
end $$;

create or replace function public.set_reservation_starts_at()
returns trigger language plpgsql security definer set search_path = public as $$
declare tz text;
begin
  select coalesce(timezone, 'America/Mexico_City') into tz from tenants where id = new.tenant_id;
  new.starts_at := (new.date + new."time"::time) at time zone tz;
  return new;
end $$;

drop trigger if exists reservations_starts_at on reservations;
create trigger reservations_starts_at
  before insert or update of date, "time", tenant_id on reservations
  for each row execute function public.set_reservation_starts_at();

-- Backfill through the trigger (date is in its OF list, so this fires it).
update reservations set date = date where starts_at is null;

-- If a tenant's timezone is corrected later, every future booking's instant
-- would silently go stale. Re-derive them instead.
create or replace function public.resync_reservation_instants()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.timezone is distinct from old.timezone then
    update reservations set date = date
     where tenant_id = new.id and starts_at >= now();
  end if;
  return new;
end $$;

drop trigger if exists tenants_resync_reservations on tenants;
create trigger tenants_resync_reservations
  after update of timezone on tenants
  for each row execute function public.resync_reservation_instants();

create index if not exists reservations_starts_idx on reservations (tenant_id, starts_at);
create index if not exists reservations_due_idx on reservations (starts_at)
  where status in ('pending', 'confirmed');

-- ── Booking policy ─────────────────────────────────────────────────────────
-- Defaults chosen so nothing changes for a tenant that never opens this screen.
alter table tenant_contact
  add column if not exists reservation_slot_minutes int     not null default 30,
  add column if not exists reservation_max_party    int     not null default 20,
  add column if not exists reservation_lead_minutes int     not null default 60,
  add column if not exists reservation_max_days     int     not null default 60,
  add column if not exists reservation_auto_confirm boolean not null default false;

-- A manager can edit the menu but could not save a reservation setting: the
-- toggle moved in the UI and silently persisted nothing, because tenant_contact
-- writes were owner-only while the server action only checked "is a member".
drop policy if exists tenant_contact_owner on tenant_contact;
do $$ begin
  if not exists (select 1 from pg_policies
    where tablename = 'tenant_contact' and policyname = 'tenant_contact_write') then
    create policy tenant_contact_write on tenant_contact for all
      using (public.can_manage_menu(tenant_id) or public.is_super_admin())
      with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- ── The single write path ──────────────────────────────────────────────────
-- Serves all three callers: the public menu form (service role, auth.uid()
-- null), staff in the dashboard (their own session), and later the WhatsApp
-- bot. Putting the rules here rather than in the route means the bot cannot
-- accidentally bypass them.
create or replace function public.request_reservation(
  p_tenant  uuid,
  p_branch  uuid,
  p_area    uuid,
  p_name    text,
  p_phone   text,
  p_party   int,
  p_date    date,
  p_time    text,
  p_note    text,
  p_source  text default 'form',
  p_force   boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id       uuid;
  v_staff    boolean;
  v_enabled  boolean;
  v_required jsonb;
  v_slot     int;
  v_maxparty int;
  v_lead     int;
  v_days     int;
  v_auto     boolean;
  v_tz       text;
  v_starts   timestamptz;
  v_branch   uuid;
  v_area     uuid;
  v_cap      int;
  v_covers   int;
begin
  -- A signed-in caller is staff; the public form arrives via the service role
  -- with no auth.uid() at all.
  v_staff := auth.uid() is not null;

  if v_staff and not (can_manage_reservations(p_tenant) or is_super_admin()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select coalesce(t.timezone, 'America/Mexico_City'), c.reservations_enabled,
         c.reservation_required, c.reservation_slot_minutes, c.reservation_max_party,
         c.reservation_lead_minutes, c.reservation_max_days, c.reservation_auto_confirm
    into v_tz, v_enabled, v_required, v_slot, v_maxparty, v_lead, v_days, v_auto
    from tenants t join tenant_contact c on c.tenant_id = t.id
   where t.id = p_tenant;

  if not found then
    raise exception 'unknown_tenant' using errcode = '22023';
  end if;

  if coalesce(p_name, '') = '' or p_date is null or coalesce(p_time, '') = '' then
    raise exception 'missing_fields' using errcode = '22023';
  end if;

  v_starts := (p_date + p_time::time) at time zone v_tz;

  -- Resolve the branch and area through the tenant, so a foreign UUID becomes
  -- NULL instead of quietly attaching this booking to someone else's room.
  select b.id into v_branch from branches b
   where b.id = p_branch and b.tenant_id = p_tenant;
  select a.id, a.max_covers into v_area, v_cap from reservation_areas a
   where a.id = p_area and a.tenant_id = p_tenant
     and (v_staff or a.public_bookable);

  if p_party < 1 or p_party > greatest(coalesce(v_maxparty, 20), 1) then
    raise exception 'party_out_of_range' using errcode = '22023';
  end if;

  -- Rules that apply to the public only. Staff can book the past and can
  -- overbook on purpose: they are looking at the actual room.
  if not v_staff then
    if not coalesce(v_enabled, false) then
      raise exception 'not_enabled' using errcode = '22023';
    end if;
    if coalesce((v_required->>'phone')::boolean, false) and coalesce(p_phone, '') = '' then
      raise exception 'phone_required' using errcode = '22023';
    end if;
    if coalesce((v_required->>'note')::boolean, false) and coalesce(p_note, '') = '' then
      raise exception 'note_required' using errcode = '22023';
    end if;
    if v_starts < now() + make_interval(mins => coalesce(v_lead, 60)) then
      raise exception 'too_soon' using errcode = '22023';
    end if;
    if v_starts > now() + make_interval(days => coalesce(v_days, 60)) then
      raise exception 'too_far' using errcode = '22023';
    end if;
  end if;

  -- Capacity, only when an area with a cap was chosen. A tenant that has not
  -- configured areas books exactly as before.
  if v_area is not null and v_cap is not null and not (v_staff and p_force) then
    -- Serialise this tenant+day so two simultaneous requests cannot both read
    -- the same total and both fit. Transaction-scoped; released on commit.
    perform pg_advisory_xact_lock(hashtextextended(p_tenant::text || p_date::text, 0));

    select coalesce(sum(party_size), 0) into v_covers
      from reservations
     where tenant_id = p_tenant
       and area_id = v_area
       and date = p_date
       and status in ('pending', 'confirmed', 'seated')
       and abs(extract(epoch from ("time"::time - p_time::time)) / 60) < coalesce(v_slot, 30);

    if v_covers + p_party > v_cap then
      raise exception 'slot_full' using errcode = '23514';
    end if;
  end if;

  insert into reservations (
    tenant_id, branch_id, area_id, customer_name, phone, party_size,
    date, "time", note, source, status
  ) values (
    p_tenant, v_branch, v_area, btrim(p_name), nullif(btrim(coalesce(p_phone, '')), ''),
    p_party, p_date, p_time, nullif(btrim(coalesce(p_note, '')), ''),
    coalesce(p_source, 'form'),
    case when v_staff or coalesce(v_auto, false) then 'confirmed' else 'pending' end
  )
  returning id into v_id;

  return v_id;
end $$;

-- The anon key must not reach this directly; the public path goes through the
-- route handler (which rate-limits) using the service role.
revoke execute on function public.request_reservation(
  uuid, uuid, uuid, text, text, int, date, text, text, text, boolean) from anon;

-- ── Realtime ───────────────────────────────────────────────────────────────
-- Mirrors 0031_orders_realtime.sql. Without this a postgres_changes
-- subscription connects happily and then never fires.
alter table reservations replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table reservations;
  end if;
end $$;
