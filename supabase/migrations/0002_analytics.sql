-- Analytics helpers for the owner dashboard and super-admin console.
-- security invoker (default) → RLS still applies, so owners only see their data.

-- Most-viewed products for a tenant within the last N days.
create or replace function public.top_products(
  p_tenant uuid,
  p_days   int default 30,
  p_limit  int default 10
)
returns table (product_id uuid, name text, views bigint)
language sql stable
as $$
  select pv.product_id, p.name, count(*) as views
  from product_views pv
  join products p on p.id = pv.product_id
  where pv.tenant_id = p_tenant
    and pv.viewed_at >= now() - make_interval(days => p_days)
  group by pv.product_id, p.name
  order by views desc
  limit p_limit;
$$;

-- Headline counters for a tenant within the last N days.
create or replace function public.tenant_stats(
  p_tenant uuid,
  p_days   int default 30
)
returns table (total_views bigint, total_orders bigint)
language sql stable
as $$
  select
    (select count(*) from product_views
       where tenant_id = p_tenant
         and viewed_at >= now() - make_interval(days => p_days)),
    (select count(*) from orders
       where tenant_id = p_tenant
         and created_at >= now() - make_interval(days => p_days));
$$;

-- Super-admin: every tenant with its owner email and subscription status.
-- security definer + explicit is_super_admin() guard so it can read across tenants.
create or replace function public.admin_tenant_overview()
returns table (
  tenant_id     uuid,
  name          text,
  subdomain     text,
  custom_domain text,
  owner_email   text,
  status        subscription_status,
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
           u.email::text, s.status, s.trial_ends_at, s.current_period_end,
           s.free_months_granted, t.created_at
    from tenants t
    join auth.users u on u.id = t.owner_id
    left join subscriptions s on s.tenant_id = t.id
    order by t.created_at desc;
end;
$$;
