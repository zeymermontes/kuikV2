-- Kuik — the host stand
--
-- Reservations so far were a list: a request, a yes, "sentada", done. A host
-- working the door runs a floor: which table, who has arrived, how long they
-- have been sitting, who is waiting and what they were quoted. This migration
-- adds that layer, following the conventions of OpenTable's host app so a
-- team migrating from it recognises every state:
--
--   reservation status  pending → confirmed → arrived / partial → seated → finished
--                       (+ no_show, cancelled; waitlist: waiting → notified → seated)
--   table status        seated → appetizer → entree → dessert → check → paid → bussing
--
-- Everything is additive; a tenant that never opens the host stand keeps
-- booking exactly as before.

-- ── Floor plan ─────────────────────────────────────────────────────────────
-- One row per table. `area_id` is the room it sits in (the floor plan tab);
-- x/y are grid cells, so the plan is resolution-independent.
create table if not exists floor_tables (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants on delete cascade,
  branch_id     uuid references branches on delete cascade,
  area_id       uuid references reservation_areas on delete set null,
  label         text not null,
  seats         int  not null default 2,
  shape         text not null default 'square'
                check (shape in ('square', 'round', 'rect', 'diamond')),
  x             int  not null default 0,
  y             int  not null default 0,
  -- Server sections: who is working this table this shift.
  server_name   text,
  -- Blocked tables stay on the plan but are not offered; null = open.
  blocked_until timestamptz,
  position      int  not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists floor_tables_tenant_idx on floor_tables (tenant_id, area_id, position);

alter table floor_tables enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'floor_tables' and policyname = 'floor_tables_read') then
    create policy floor_tables_read on floor_tables for select
      using (public.can_manage_reservations(tenant_id) or public.is_super_admin());
  end if;
  -- The host stand assigns servers and blocks tables; drawing the plan is a manager's job.
  if not exists (select 1 from pg_policies where tablename = 'floor_tables' and policyname = 'floor_tables_update') then
    create policy floor_tables_update on floor_tables for update
      using (public.can_manage_reservations(tenant_id) or public.is_super_admin())
      with check (public.can_manage_reservations(tenant_id) or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'floor_tables' and policyname = 'floor_tables_insert') then
    create policy floor_tables_insert on floor_tables for insert
      with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'floor_tables' and policyname = 'floor_tables_delete') then
    create policy floor_tables_delete on floor_tables for delete
      using (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

alter table floor_tables replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'floor_tables') then
    alter publication supabase_realtime add table floor_tables;
  end if;
end $$;

-- ── Table combinations ─────────────────────────────────────────────────────
-- Tables that can be pushed together for a bigger party ("13a + 13b seats 8").
-- Seating a party on a combination sets every member table busy.
create table if not exists floor_combinations (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants on delete cascade,
  area_id     uuid references reservation_areas on delete set null,
  table_ids   uuid[] not null,
  seats       int  not null,
  created_at  timestamptz not null default now()
);

create index if not exists floor_combinations_tenant_idx on floor_combinations (tenant_id);

alter table floor_combinations enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'floor_combinations' and policyname = 'floor_combinations_read') then
    create policy floor_combinations_read on floor_combinations for select
      using (public.can_manage_reservations(tenant_id) or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'floor_combinations' and policyname = 'floor_combinations_write') then
    create policy floor_combinations_write on floor_combinations for all
      using (public.can_manage_menu(tenant_id) or public.is_super_admin())
      with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

alter table floor_combinations replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'floor_combinations') then
    alter publication supabase_realtime add table floor_combinations;
  end if;
end $$;

-- ── The party on the floor ─────────────────────────────────────────────────
alter table reservations
  add column if not exists table_ids      uuid[] not null default '{}',
  -- Course progression while seated (OpenTable's "table status").
  add column if not exists table_status   text not null default 'seated',
  add column if not exists arrived_at     timestamptz,
  add column if not exists seated_at      timestamptz,
  add column if not exists finished_at    timestamptz,
  -- Waitlist: what the guest was told, and when we said "your table is ready".
  add column if not exists quoted_minutes int,
  add column if not exists notified_at    timestamptz,
  add column if not exists server_name    text,
  -- vip, first_time, birthday, anniversary, allergy… free-form but short.
  add column if not exists tags           text[] not null default '{}',
  -- Override of the turn time for this party; null = by party size.
  add column if not exists turn_minutes   int;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reservations_status_check') then
    alter table reservations add constraint reservations_status_check check (status in (
      'pending', 'confirmed', 'arrived', 'partial', 'seated', 'finished',
      'no_show', 'cancelled', 'waiting', 'notified'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'reservations_table_status_check') then
    alter table reservations add constraint reservations_table_status_check check (table_status in (
      'seated', 'appetizer', 'entree', 'dessert', 'check', 'paid', 'bussing'));
  end if;
end $$;

-- A walk-in is its own source: it never had a booking.
alter table reservations drop constraint if exists reservations_source_check;
alter table reservations add constraint reservations_source_check
  check (source in ('form', 'manual', 'bot', 'phone', 'walkin'));

create index if not exists reservations_floor_idx on reservations (tenant_id, date)
  where status in ('arrived', 'partial', 'seated', 'waiting', 'notified');

-- ── Shifts, turn times, lateness ───────────────────────────────────────────
-- Null keeps the app defaults (Comida 12–17, Cena 17–23:30; 1–2 pax 60 min,
-- 3–4 90, 5–6 105, 7+ 120; late after 15 min).
alter table tenant_contact
  add column if not exists reservation_shifts       jsonb,
  add column if not exists reservation_turn_minutes jsonb,
  add column if not exists reservation_late_minutes int not null default 15;

-- ── Capacity: an arrived party still holds its covers ──────────────────────
-- Same function as 0056 with the status list widened; nothing else changes.
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
  v_name     text;
begin
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

  -- The name is required unless the restaurant turned that off. When it is
  -- optional and blank, fall back to the phone number so the booking is still
  -- identifiable on the board instead of showing an empty row.
  v_name := nullif(btrim(coalesce(p_name, '')), '');
  if v_name is null then
    if coalesce((v_required->>'name')::boolean, true) then
      raise exception 'missing_fields' using errcode = '22023';
    end if;
    v_name := coalesce(nullif(btrim(coalesce(p_phone, '')), ''), 'Sin nombre');
  end if;

  if p_date is null or coalesce(p_time, '') = '' then
    raise exception 'missing_fields' using errcode = '22023';
  end if;

  v_starts := (p_date + p_time::time) at time zone v_tz;

  select b.id into v_branch from branches b
   where b.id = p_branch and b.tenant_id = p_tenant;
  select a.id, a.max_covers into v_area, v_cap from reservation_areas a
   where a.id = p_area and a.tenant_id = p_tenant
     and (v_staff or a.public_bookable);

  if p_party < 1 or p_party > greatest(coalesce(v_maxparty, 20), 1) then
    raise exception 'party_out_of_range' using errcode = '22023';
  end if;

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

  if v_area is not null and v_cap is not null and not (v_staff and p_force) then
    perform pg_advisory_xact_lock(hashtextextended(p_tenant::text || p_date::text, 0));

    select coalesce(sum(party_size), 0) into v_covers
      from reservations
     where tenant_id = p_tenant
       and area_id = v_area
       and date = p_date
       and status in ('pending', 'confirmed', 'arrived', 'partial', 'seated')
       and abs(extract(epoch from ("time"::time - p_time::time)) / 60) < coalesce(v_slot, 30);

    if v_covers + p_party > v_cap then
      raise exception 'slot_full' using errcode = '23514';
    end if;
  end if;

  insert into reservations (
    tenant_id, branch_id, area_id, customer_name, phone, party_size,
    date, "time", note, source, status
  ) values (
    p_tenant, v_branch, v_area, v_name, nullif(btrim(coalesce(p_phone, '')), ''),
    p_party, p_date, p_time, nullif(btrim(coalesce(p_note, '')), ''),
    coalesce(p_source, 'form'),
    case when v_staff or coalesce(v_auto, false) then 'confirmed' else 'pending' end
  )
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function public.request_reservation(
  uuid, uuid, uuid, text, text, int, date, text, text, text, boolean) from anon;
