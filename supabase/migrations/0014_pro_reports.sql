-- Kuik — Pro analytics helpers (run as caller, so RLS still scopes to the tenant)

-- Daily orders + estimated revenue.
create or replace function public.sales_series(p_tenant uuid, p_days int default 30)
returns table (day date, orders bigint, revenue numeric)
language sql stable as $$
  select date_trunc('day', created_at)::date as day,
         count(*)::bigint as orders,
         coalesce(sum(total), 0) as revenue
  from orders
  where tenant_id = p_tenant and created_at >= now() - make_interval(days => p_days)
  group by 1 order by 1;
$$;

-- Orders by hour of day (0–23).
create or replace function public.busiest_hours(p_tenant uuid, p_days int default 30)
returns table (hour int, orders bigint)
language sql stable as $$
  select extract(hour from created_at)::int as hour, count(*)::bigint as orders
  from orders
  where tenant_id = p_tenant and created_at >= now() - make_interval(days => p_days)
  group by 1 order by 1;
$$;

-- Loyalty headline numbers.
create or replace function public.loyalty_summary(p_tenant uuid)
returns table (members bigint, redemptions bigint)
language sql stable as $$
  select
    (select count(*) from loyalty_customers where tenant_id = p_tenant),
    (select count(*) from loyalty_events where tenant_id = p_tenant and kind = 'redeem');
$$;

-- Best loyalty customers by visits.
create or replace function public.top_customers(p_tenant uuid, p_limit int default 10)
returns table (name text, phone text, visits int, stamps int, points numeric)
language sql stable as $$
  select coalesce(name, '—'), phone, total_visits, stamps, points
  from loyalty_customers
  where tenant_id = p_tenant
  order by total_visits desc, points desc
  limit p_limit;
$$;
