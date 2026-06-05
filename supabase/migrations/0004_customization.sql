-- Kuik — expanded menu customization
-- Adds: product enrichments (variants, modifiers, discounts, prep time, calories),
-- branding (cover image + slogan), and a per-tenant ordering config table.

-- ── Product enrichments ──────────────────────────────────────────────────────
alter table products
  add column compare_at_price numeric(10,2),           -- "before" price (strike-through)
  add column prep_time        text,                     -- e.g. "15 min"
  add column calories         integer,
  add column variants         jsonb not null default '[]',  -- [{name, price}]
  add column modifiers        jsonb not null default '[]';  -- [{name, price}] optional add-ons
-- `tags` already exists on products and is reused for badges (e.g. ["new","spicy"]).

-- ── Branding ─────────────────────────────────────────────────────────────────
alter table tenant_theme
  add column cover_image_url text,
  add column slogan          text;
-- `settings` jsonb already exists on tenant_theme; it holds all the look-and-feel
-- knobs (dark mode, card style, image shape, radius, density, search, etc.).

-- ── Ordering config (1:1 with tenant) ────────────────────────────────────────
create table tenant_ordering (
  tenant_id           uuid primary key references tenants on delete cascade,
  service_types       text[] not null default '{pickup}',  -- pickup | delivery | dinein
  order_header        text,                                 -- intro line in the WA message
  min_order           numeric(10,2),
  delivery_fee        numeric(10,2),
  free_delivery_over  numeric(10,2),
  tips                integer[] not null default '{}',      -- suggested % e.g. {10,15,20}
  collect_address     boolean not null default false,
  collect_pickup_time boolean not null default false,
  collect_table       boolean not null default false,
  updated_at          timestamptz not null default now()
);

alter table tenant_ordering enable row level security;

create policy tenant_ordering_owner_all on tenant_ordering for all
  using (public.owns_tenant(tenant_id) or public.is_super_admin())
  with check (public.owns_tenant(tenant_id) or public.is_super_admin());

-- Provision an ordering row for every existing and future tenant.
insert into tenant_ordering (tenant_id)
  select id from tenants on conflict (tenant_id) do nothing;

-- Extend the new-tenant trigger to also create the ordering row.
create or replace function public.handle_new_tenant()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.tenant_theme    (tenant_id) values (new.id);
  insert into public.tenant_contact  (tenant_id) values (new.id);
  insert into public.tenant_ordering (tenant_id) values (new.id);
  insert into public.subscriptions   (tenant_id, status, trial_ends_at)
    values (new.id, 'trialing', now() + interval '30 days');
  return new;
end;
$$;
