-- Kuik — operations by branch: sold-out per location, stock per location, orders with their branch
--
-- Branches shared one availability, one stock and no trace on online orders:
-- "no avocado" at one location greyed the dish everywhere, a sale at one
-- branch drew down the other's shelf, and a report could not tell branches
-- apart. Three things change, all keeping the main location (branch_id
-- null) exactly as it worked before:
--
--   1. orders.branch_id: the menu at /b/<branch> records which branch the
--      order is for (the register's tabs already carry it, 0077's columns).
--   2. branch_sold_out: a product or an option run out AT ONE LOCATION. The
--      product's own is_available stays the restaurant-wide switch (the
--      dashboard's); the register of a location writes here instead once
--      the restaurant has branches, and every reader overlays the rows of
--      the location it is showing.
--   3. ingredient_stock: an ingredient's stock and minimum at a branch.
--      ingredients.stock stays the main location's, so a restaurant without
--      branches sees no change; move_stock takes the branch and keeps the
--      two apart, and auto sold-out writes to branch_sold_out for a branch.

-- ── 1. Orders know their branch ─────────────────────────────────────────────
alter table orders add column if not exists branch_id uuid references branches on delete set null;
create index if not exists orders_branch_idx on orders (tenant_id, branch_id, created_at desc);

-- ── 2. Sold out at one location ─────────────────────────────────────────────
create table if not exists branch_sold_out (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants on delete cascade,
  -- Null is the main location.
  branch_id   uuid references branches on delete cascade,
  -- Exactly one of the two: a product, or an option by name (lower, trimmed),
  -- which is how 0078 marks options across products.
  product_id  uuid references products on delete cascade,
  option_key  text,
  created_at  timestamptz not null default now(),
  check ((product_id is null) <> (option_key is null))
);
create unique index if not exists branch_sold_out_key on branch_sold_out (
  tenant_id,
  coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(product_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(option_key, '')
);
create index if not exists branch_sold_out_tenant_idx on branch_sold_out (tenant_id, branch_id);
-- Realtime DELETE events carry the whole row, so a register can un-grey the right product.
alter table branch_sold_out replica identity full;

alter table branch_sold_out enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'branch_sold_out' and policyname = 'branch_sold_out_read') then
    create policy branch_sold_out_read on branch_sold_out for select using (public.can_operate_pos(tenant_id) or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'branch_sold_out' and policyname = 'branch_sold_out_manage') then
    create policy branch_sold_out_manage on branch_sold_out for all
      using (public.can_manage_menu(tenant_id) or public.is_super_admin())
      with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- Mark a product or an option out (or back) at one location. The register's
-- roles may, like set_product_availability (0045).
create or replace function public.set_location_availability(
  p_tenant uuid, p_branch uuid, p_product uuid, p_option text, p_available boolean
) returns void language plpgsql security definer set search_path = public as $$
declare k text := nullif(lower(trim(coalesce(p_option, ''))), '');
begin
  if not (public.can_operate_pos(p_tenant) or public.is_super_admin()) then
    raise exception 'forbidden';
  end if;
  if (p_product is null) = (k is null) then
    raise exception 'one of product or option';
  end if;
  if p_available then
    delete from branch_sold_out
     where tenant_id = p_tenant
       and branch_id is not distinct from p_branch
       and product_id is not distinct from p_product
       and option_key is not distinct from k;
  else
    insert into branch_sold_out (tenant_id, branch_id, product_id, option_key)
    values (p_tenant, p_branch, p_product, k)
    on conflict do nothing;
  end if;
end;
$$;
revoke execute on function public.set_location_availability(uuid, uuid, uuid, text, boolean) from anon;

-- ── 3. Stock per branch ─────────────────────────────────────────────────────
create table if not exists ingredient_stock (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants on delete cascade,
  ingredient_id  uuid not null references ingredients on delete cascade,
  branch_id      uuid not null references branches on delete cascade,
  stock          numeric(12,3) not null default 0,
  min_stock      numeric(12,3),
  updated_at     timestamptz not null default now(),
  unique (ingredient_id, branch_id)
);
create index if not exists ingredient_stock_branch_idx on ingredient_stock (tenant_id, branch_id);

alter table stock_movements  add column if not exists branch_id uuid references branches on delete set null;
alter table purchase_orders  add column if not exists branch_id uuid references branches on delete set null;
create index if not exists stock_movements_branch_idx on stock_movements (tenant_id, branch_id, created_at desc);

alter table ingredient_stock enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'ingredient_stock' and policyname = 'ingredient_stock_read') then
    create policy ingredient_stock_read on ingredient_stock for select using (public.can_operate_pos(tenant_id) or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'ingredient_stock' and policyname = 'ingredient_stock_manage') then
    create policy ingredient_stock_manage on ingredient_stock for all
      using (public.can_manage_menu(tenant_id) or public.is_super_admin())
      with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- move_stock with a branch: the branch's row moves, the movement is tagged,
-- and auto sold-out marks the products at that branch (branch_sold_out).
-- Without one it is 0077's function exactly: ingredients.stock and the
-- restaurant-wide is_available.
drop function if exists public.move_stock(uuid, uuid, text, numeric, uuid, text, uuid, uuid);
create or replace function public.move_stock(
  p_tenant uuid, p_ingredient uuid, p_kind text, p_qty numeric,
  p_ref uuid default null, p_note text default null, p_employee uuid default null, p_user uuid default null,
  p_branch uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  ing ingredients%rowtype;
  new_stock numeric;
begin
  if p_branch is null then
    update ingredients set stock = stock + p_qty, updated_at = now()
     where id = p_ingredient and tenant_id = p_tenant
     returning * into ing;
    if not found then return; end if;
    new_stock := ing.stock;
  else
    select * into ing from ingredients where id = p_ingredient and tenant_id = p_tenant;
    if not found then return; end if;
    insert into ingredient_stock (tenant_id, ingredient_id, branch_id, stock)
    values (p_tenant, p_ingredient, p_branch, p_qty)
    on conflict (ingredient_id, branch_id) do update
      set stock = ingredient_stock.stock + excluded.stock, updated_at = now()
    returning stock into new_stock;
  end if;

  insert into stock_movements (tenant_id, ingredient_id, kind, qty, ref_id, note, employee_id, created_by, branch_id)
  values (p_tenant, p_ingredient, p_kind, p_qty, p_ref, p_note, p_employee, p_user, p_branch);

  if not ing.auto_86 then return; end if;

  if p_branch is null then
    if new_stock <= 0 and p_qty < 0 then
      update products set is_available = false
       where tenant_id = p_tenant and is_available
         and id in (select product_id from product_ingredients where ingredient_id = p_ingredient);
    elsif new_stock > 0 and p_qty > 0 then
      update products set is_available = true
       where tenant_id = p_tenant and not is_available
         and id in (select product_id from product_ingredients where ingredient_id = p_ingredient)
         and not exists (
           select 1 from product_ingredients pi join ingredients i on i.id = pi.ingredient_id
            where pi.product_id = products.id and i.auto_86 and i.stock <= 0);
    end if;
  else
    if new_stock <= 0 and p_qty < 0 then
      insert into branch_sold_out (tenant_id, branch_id, product_id)
      select p_tenant, p_branch, product_id from product_ingredients where ingredient_id = p_ingredient
      on conflict do nothing;
    elsif new_stock > 0 and p_qty > 0 then
      delete from branch_sold_out b
       where b.tenant_id = p_tenant and b.branch_id = p_branch
         and b.product_id in (select product_id from product_ingredients where ingredient_id = p_ingredient)
         and not exists (
           select 1 from product_ingredients pi
             join ingredients i on i.id = pi.ingredient_id
             left join ingredient_stock s on s.ingredient_id = i.id and s.branch_id = p_branch
            where pi.product_id = b.product_id and i.auto_86 and coalesce(s.stock, 0) <= 0);
    end if;
  end if;
end;
$$;
revoke execute on function public.move_stock(uuid, uuid, text, numeric, uuid, text, uuid, uuid, uuid) from anon;

drop function if exists public.count_stock(uuid, uuid, numeric, text, uuid);
create or replace function public.count_stock(p_tenant uuid, p_ingredient uuid, p_counted numeric, p_note text default null, p_user uuid default null, p_branch uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare cur numeric;
begin
  if p_branch is null then
    select stock into cur from ingredients where id = p_ingredient and tenant_id = p_tenant;
  else
    select coalesce((select stock from ingredient_stock where ingredient_id = p_ingredient and branch_id = p_branch), 0) into cur
      from ingredients where id = p_ingredient and tenant_id = p_tenant;
  end if;
  if cur is null then return; end if;
  perform public.move_stock(p_tenant, p_ingredient, 'count', p_counted - cur, null, p_note, null, p_user, p_branch);
end;
$$;
revoke execute on function public.count_stock(uuid, uuid, numeric, text, uuid, uuid) from anon;

-- Sales take the branch's shelf.
create or replace function public.tabs_deduct_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status <> 'paid' or new.stock_deducted_at is not null then return new; end if;
  for r in
    select pi.ingredient_id, sum(pi.qty * ti.qty) as qty
      from tab_items ti join product_ingredients pi on pi.product_id = ti.product_id
     where ti.tab_id = new.id and ti.voided_at is null
     group by pi.ingredient_id
  loop
    perform public.move_stock(new.tenant_id, r.ingredient_id, 'sale', -r.qty, new.id, null, new.employee_id, null, new.branch_id);
  end loop;
  new.stock_deducted_at := now();
  return new;
end;
$$;

create or replace function public.orders_deduct_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if new.status = 'new' or new.stock_deducted_at is not null then return new; end if;
  for r in
    select pi.ingredient_id, sum(pi.qty * coalesce((l->>'qty')::numeric, 1)) as qty
      from jsonb_array_elements(coalesce(new.items, '[]'::jsonb)) l
      join product_ingredients pi on pi.product_id::text = l->>'productId'
     where pi.tenant_id = new.tenant_id
     group by pi.ingredient_id
  loop
    perform public.move_stock(new.tenant_id, r.ingredient_id, 'sale', -r.qty, new.id, null, null, null, new.branch_id);
  end loop;
  new.stock_deducted_at := now();
  return new;
end;
$$;

-- ── Reports by branch ───────────────────────────────────────────────────────
-- The same helpers with an optional branch; null keeps every location.
create or replace function public.sales_series(p_tenant uuid, p_days int default 30, p_branch uuid default null)
returns table (day date, orders bigint, revenue numeric)
language sql stable as $$
  select date_trunc('day', created_at)::date as day,
         count(*)::bigint as orders,
         coalesce(sum(total), 0) as revenue
  from orders
  where tenant_id = p_tenant and created_at >= now() - make_interval(days => p_days)
    and (p_branch is null or branch_id = p_branch)
  group by 1 order by 1;
$$;

create or replace function public.busiest_hours(p_tenant uuid, p_days int default 30, p_branch uuid default null)
returns table (hour int, orders bigint)
language sql stable as $$
  select extract(hour from created_at)::int as hour, count(*)::bigint as orders
  from orders
  where tenant_id = p_tenant and created_at >= now() - make_interval(days => p_days)
    and (p_branch is null or branch_id = p_branch)
  group by 1 order by 1;
$$;

create or replace function public.tenant_stats(p_tenant uuid, p_days int default 30, p_branch uuid default null)
returns table (total_views bigint, total_orders bigint)
language sql stable as $$
  select
    (select count(*) from product_views
       where tenant_id = p_tenant
         and viewed_at >= now() - make_interval(days => p_days)),
    (select count(*) from orders
       where tenant_id = p_tenant
         and created_at >= now() - make_interval(days => p_days)
         and (p_branch is null or branch_id = p_branch));
$$;
