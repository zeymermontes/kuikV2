-- Kuik — expose each tenant's plan tier in the super-admin overview.

-- This widens the row type defined in 0002_analytics.sql, and `create or
-- replace` cannot change a function's return type — it errors with "cannot
-- change return type of existing function". Drop first so this file applies to
-- a database that already has the old shape, and re-applies cleanly.
drop function if exists public.admin_tenant_overview();

create or replace function public.admin_tenant_overview()
returns table (
  tenant_id     uuid,
  name          text,
  subdomain     text,
  custom_domain text,
  owner_email   text,
  status        subscription_status,
  plan          text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  free_months_granted int,
  created_at    timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  return query
    select t.id, t.name, t.subdomain, t.custom_domain,
           u.email::text, s.status, s.plan, s.trial_ends_at, s.current_period_end,
           s.free_months_granted, t.created_at
    from tenants t
    join auth.users u on u.id = t.owner_id
    left join subscriptions s on s.tenant_id = t.id
    order by t.created_at desc;
end;
$$;
