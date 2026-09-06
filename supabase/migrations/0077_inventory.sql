-- Kuik — inventory: ingredients, recipes, stock movements, purchase orders
--
-- Each product may have a recipe (so many grams of this, so many pieces of
-- that). When a sale closes at the register, or an online order is accepted,
-- the database takes the ingredients off the shelf: a movement per ingredient
-- and the running stock on the ingredient row. Purchases put stock back and
-- refresh the cost; counts and waste correct it. An ingredient can stand for
-- a finished product too (a bottle of beer: recipe of 1 piece of itself), so
-- simple stock tracking needs no recipe at all.
--
-- Deduction runs in triggers, like the loyalty award (0073): a sale closed
-- offline reaches the server later and still counts, exactly once.

create table if not exists ingredients (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants on delete cascade,
  name           text not null,
  -- g, kg, ml, l, pza (piece), porcion
  unit           text not null default 'pza',
  stock          numeric(12,3) not null default 0,
  min_stock      numeric(12,3),
  -- Cost per `unit`, refreshed by purchases (last cost).
  cost_per_unit  numeric(12,4) not null default 0,
  supplier       text,
  -- Mark the products that use it as sold out when it runs out; back when stock returns.
  auto_86        boolean not null default false,
  active         boolean not null default true,
  position       int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists ingredients_tenant_idx on ingredients (tenant_id, position);

create table if not exists product_ingredients (
  product_id     uuid not null references products on delete cascade,
  ingredient_id  uuid not null references ingredients on delete cascade,
  tenant_id      uuid not null references tenants on delete cascade,
  -- In the ingredient's unit, per one unit of the product.
  qty            numeric(12,3) not null,
  primary key (product_id, ingredient_id)
);
create index if not exists product_ingredients_ingredient_idx on product_ingredients (ingredient_id);

create table if not exists stock_movements (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants on delete cascade,
  ingredient_id  uuid not null references ingredients on delete cascade,
  -- sale: taken by a sale; purchase: received; waste: thrown away; count: set to what was counted; adjust: by hand
  kind           text not null check (kind in ('sale', 'purchase', 'waste', 'count', 'adjust')),
  -- Signed, in the ingredient's unit. A count stores the difference it made.
  qty            numeric(12,3) not null,
  -- The sale, order or purchase order behind it.
  ref_id         uuid,
  note           text,
  employee_id    uuid references employees on delete set null,
  created_by     uuid,
  created_at     timestamptz not null default now()
);
create index if not exists stock_movements_tenant_idx on stock_movements (tenant_id, created_at desc);
create index if not exists stock_movements_ingredient_idx on stock_movements (ingredient_id, created_at desc);

create table if not exists purchase_orders (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants on delete cascade,
  supplier     text,
  status       text not null default 'draft' check (status in ('draft', 'sent', 'received', 'cancelled')),
  -- [{ingredient_id, name, qty, cost}] — cost is per unit at the time of the order.
  items        jsonb not null default '[]'::jsonb,
  total        numeric(12,2) not null default 0,
  note         text,
  created_at   timestamptz not null default now(),
  received_at  timestamptz,
  updated_at   timestamptz not null default now()
);
create index if not exists purchase_orders_tenant_idx on purchase_orders (tenant_id, created_at desc);

alter table ingredients         enable row level security;
alter table product_ingredients enable row level security;
alter table stock_movements     enable row level security;
alter table purchase_orders     enable row level security;

do $$ declare tbl text; begin
  foreach tbl in array array['ingredients', 'product_ingredients', 'stock_movements', 'purchase_orders'] loop
    if not exists (select 1 from pg_policies where tablename = tbl and policyname = tbl || '_read') then
      execute format('create policy %I on %I for select using (public.can_operate_pos(tenant_id) or public.is_super_admin())', tbl || '_read', tbl);
    end if;
    if not exists (select 1 from pg_policies where tablename = tbl and policyname = tbl || '_manage') then
      execute format('create policy %I on %I for all using (public.can_manage_menu(tenant_id) or public.is_super_admin()) with check (public.can_manage_menu(tenant_id) or public.is_super_admin())', tbl || '_manage', tbl);
    end if;
  end loop;
end $$;

-- ── Applying a movement ─────────────────────────────────────────────────────
-- One function moves stock and logs it, so every path (sale, purchase, waste,
-- count) agrees. auto_86 flips the products that need the ingredient.
create or replace function public.move_stock(
  p_tenant uuid, p_ingredient uuid, p_kind text, p_qty numeric, p_ref uuid default null, p_note text default null, p_employee uuid default null, p_user uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  ing ingredients%rowtype;
begin
  update ingredients set stock = stock + p_qty, updated_at = now()
   where id = p_ingredient and tenant_id = p_tenant
   returning * into ing;
  if not found then return; end if;
  insert into stock_movements (tenant_id, ingredient_id, kind, qty, ref_id, note, employee_id, created_by)
  values (p_tenant, p_ingredient, p_kind, p_qty, p_ref, p_note, p_employee, p_user);
  if ing.auto_86 then
    if ing.stock <= 0 and p_qty < 0 then
      update products set is_available = false
       where tenant_id = p_tenant and is_available
         and id in (select product_id from product_ingredients where ingredient_id = p_ingredient);
    elsif ing.stock > 0 and p_qty > 0 then
      update products set is_available = true
       where tenant_id = p_tenant and not is_available
         and id in (select product_id from product_ingredients where ingredient_id = p_ingredient)
         and not exists (
           select 1 from product_ingredients pi join ingredients i on i.id = pi.ingredient_id
            where pi.product_id = products.id and i.auto_86 and i.stock <= 0);
    end if;
  end if;
end;
$$;
revoke execute on function public.move_stock(uuid, uuid, text, numeric, uuid, text, uuid, uuid) from anon;

/** Set an ingredient to what was counted; the movement records the difference. */
create or replace function public.count_stock(p_tenant uuid, p_ingredient uuid, p_counted numeric, p_note text default null, p_user uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare cur numeric;
begin
  select stock into cur from ingredients where id = p_ingredient and tenant_id = p_tenant;
  if cur is null then return; end if;
  perform public.move_stock(p_tenant, p_ingredient, 'count', p_counted - cur, null, p_note, null, p_user);
end;
$$;
revoke execute on function public.count_stock(uuid, uuid, numeric, text, uuid) from anon;

-- ── Sales take ingredients ──────────────────────────────────────────────────
alter table tabs   add column if not exists stock_deducted_at timestamptz;
alter table orders add column if not exists stock_deducted_at timestamptz;

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
    perform public.move_stock(new.tenant_id, r.ingredient_id, 'sale', -r.qty, new.id, null, new.employee_id, null);
  end loop;
  new.stock_deducted_at := now();
  return new;
end;
$$;
drop trigger if exists tabs_stock on tabs;
create trigger tabs_stock before insert or update of status on tabs
  for each row execute function public.tabs_deduct_stock();

-- An online order takes stock when the restaurant accepts it (status leaves 'new').
create or replace function public.orders_deduct_stock()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  line jsonb;
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
    perform public.move_stock(new.tenant_id, r.ingredient_id, 'sale', -r.qty, new.id, null, null, null);
  end loop;
  new.stock_deducted_at := now();
  return new;
end;
$$;
drop trigger if exists orders_stock on orders;
create trigger orders_stock before update of status on orders
  for each row execute function public.orders_deduct_stock();
