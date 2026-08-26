-- Kuik — foundations for reservations, roles and the WhatsApp bot
--
-- Three unrelated-looking things live here because they are all prerequisites
-- that nothing else can be built correctly without:
--   1. a real timezone per tenant   (reminders, "is it open now", "what is today")
--   2. a rate limiter               (the public routes have none at all)
--   3. role predicates              (so a role can be added without widening access)
--
-- Safe to re-run: every statement is guarded.

-- ── 1. Tenant locale of place ──────────────────────────────────────────────
-- An IANA name, never a numeric offset. Mexico abolished DST in 2022 *except*
-- Baja California, and Postgres' tzdata already knows the difference; an offset
-- would silently drift for those tenants twice a year.
alter table tenants add column if not exists timezone text not null
  default 'America/Mexico_City';

-- Default country for phone normalisation. A 10-digit number is meaningless
-- without knowing where it was dialled from.
alter table tenants add column if not exists country_iso text not null default 'MX';

-- ── 2. Rate limiting ───────────────────────────────────────────────────────
-- There is no Redis here and adding one for this would be silly. A single
-- upsert against a tiny table is atomic, portable, and fast enough: the public
-- routes it protects are not on any hot path.
create table if not exists rate_limits (
  bucket     text primary key,
  count      int not null default 0,
  expires_at timestamptz not null
);

create index if not exists rate_limits_expiry_idx on rate_limits (expires_at);

-- Returns the hit count *including* this call. Callers compare it to their own
-- limit, so one shared function serves buckets with different budgets.
-- An expired window resets in the same statement that increments it, which is
-- why this is one round trip and not a read-then-write race.
create or replace function public.rate_limit_hit(p_bucket text, p_window_seconds int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into rate_limits (bucket, count, expires_at)
  values (p_bucket, 1, now() + make_interval(secs => p_window_seconds))
  on conflict (bucket) do update
    set count = case
          when rate_limits.expires_at < now() then 1
          else rate_limits.count + 1
        end,
        expires_at = case
          when rate_limits.expires_at < now()
            then now() + make_interval(secs => p_window_seconds)
          else rate_limits.expires_at
        end
  returning count into v_count;
  return v_count;
end;
$$;

-- RLS on with NO policies: denies every anon/authenticated request outright.
-- Only the service-role client can touch this table.
alter table rate_limits enable row level security;

-- ── 3. Role predicates ─────────────────────────────────────────────────────
-- `is_member()` is too coarse: it grants read on sales figures, billing amounts
-- and diner personal data to every staff member. These split that up so a new
-- role can be added (see 0045) without inheriting everything.
--
-- Compare role::text throughout, so a freshly-added enum value works in the
-- same transaction (the pattern established in 0033_pos.sql).

-- Revenue, orders, analytics.
create or replace function public.can_view_sales(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members
    where tenant_id = t and user_id = auth.uid()
      and role::text in ('owner', 'manager', 'cashier')
  );
$$;

-- Loyalty holds diner names, phones and point balances.
create or replace function public.can_use_loyalty(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members
    where tenant_id = t and user_id = auth.uid()
      and role::text in ('owner', 'manager', 'cashier', 'waiter')
  );
$$;

-- Reservations. 'host' does not exist as an enum value until 0045; comparing
-- role::text means this function is correct before and after that migration.
create or replace function public.can_manage_reservations(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members
    where tenant_id = t and user_id = auth.uid()
      and role::text in ('owner', 'manager', 'cashier', 'waiter', 'host')
  );
$$;
