-- Kuik — let a restaurant decide whether the name is required
--
-- The name was hardcoded as mandatory, which is wrong for a walk-in counter or
-- a quick phone booking where the number IS the identity. It stays required by
-- default, so nothing changes for anyone who never opens the setting.

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
