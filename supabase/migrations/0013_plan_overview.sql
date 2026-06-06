-- Kuik — expose each tenant's plan tier in the super-admin overview.

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
