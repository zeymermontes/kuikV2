-- Kuik — promotions
--
-- Discounts the restaurant sets up once and the register and the menu apply
-- by themselves: a percentage or amount off the whole order or off some
-- categories or products, two-for-one, happy hour by day and time, a date
-- range, a minimum spend, and coupons (a promotion with a code applies only
-- when the code is typed). The same rule file (lib/promotions.ts) runs at
-- the register, in the diner's cart and on the server that prices an online
-- order, so what the guest sees is what gets charged.

create table if not exists promotions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants on delete cascade,
  name          text not null,
  -- percent: `value` is 0-100; amount: `value` in the menu's currency; bogo: every second unit free.
  kind          text not null default 'percent' check (kind in ('percent', 'amount', 'bogo')),
  value         numeric(10,2) not null default 0,
  -- order: on the subtotal; category / product: on the matching lines only.
  scope         text not null default 'order' check (scope in ('order', 'category', 'product')),
  category_ids  uuid[] not null default '{}',
  product_ids   uuid[] not null default '{}',
  -- A coupon: applies only when this code is typed. Null = automatic.
  code          text,
  min_subtotal  numeric(10,2),
  -- 0 = Monday … 6 = Sunday; empty = every day.
  days          int[] not null default '{}',
  start_time    time,
  end_time      time,
  starts_on     date,
  ends_on       date,
  -- Where it applies: pos (the register), menu (the diner's cart).
  channels      text[] not null default '{pos,menu}',
  -- Two promotions on the same lines: the best one wins unless this is set.
  stackable     boolean not null default false,
  active        boolean not null default true,
  position      int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists promotions_tenant_idx on promotions (tenant_id, position);
create unique index if not exists promotions_code_idx on promotions (tenant_id, upper(code)) where code is not null;

alter table promotions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'promotions' and policyname = 'promotions_read') then
    create policy promotions_read on promotions for select
      using (public.can_operate_pos(tenant_id) or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'promotions' and policyname = 'promotions_write') then
    create policy promotions_write on promotions for all
      using (public.can_manage_menu(tenant_id) or public.is_super_admin())
      with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- The register keeps a copy offline, like employees.
alter table promotions replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'promotions') then
    alter publication supabase_realtime add table promotions;
  end if;
end $$;

-- ── Where the discount lands ────────────────────────────────────────────────
-- tabs.discount stays the cashier's manual discount; promotions add their own
-- amount beside it, with the list of what applied and the coupon typed.
alter table tabs
  add column if not exists promo_discount numeric(10,2) not null default 0,
  add column if not exists promos         jsonb,
  add column if not exists promo_code     text;

alter table orders
  add column if not exists discount   numeric(10,2),
  add column if not exists promos     jsonb,
  add column if not exists promo_code text;
