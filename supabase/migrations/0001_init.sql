-- Kuik — initial schema
-- Multi-tenant digital menu SaaS. Every tenant-scoped row carries tenant_id and is
-- protected by RLS. Public menu reads happen server-side with the service-role key
-- (bypasses RLS), so there are no anon policies here.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role          as enum ('owner', 'super_admin');
create type subscription_status as enum ('trialing', 'active', 'past_due', 'canceled');
create type domain_status      as enum ('none', 'pending', 'verified', 'error');
create type separator_style    as enum ('line', 'space', 'title');

-- ---------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id         uuid primary key references auth.users on delete cascade,
  role       user_role   not null default 'owner',
  full_name  text,
  locale     text        not null default 'es',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
create table tenants (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references auth.users on delete cascade,
  name                 text not null,
  subdomain            text not null unique
                         check (subdomain ~ '^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$'),
  custom_domain        text unique,
  custom_domain_status domain_status not null default 'none',
  locale               text not null default 'es',
  is_published         boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index tenants_owner_idx on tenants (owner_id);

-- ---------------------------------------------------------------------------
-- tenant_theme  (1:1)
-- ---------------------------------------------------------------------------
create table tenant_theme (
  tenant_id            uuid primary key references tenants on delete cascade,
  primary_color        text not null default '#111111',
  secondary_color      text not null default '#f59e0b',
  background_color     text not null default '#ffffff',
  text_color           text not null default '#111111',
  font_family          text not null default 'Inter',
  background_image_url text,
  logo_url             text,
  show_prices          boolean not null default true,
  settings             jsonb not null default '{}',   -- extra customization knobs
  updated_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tenant_contact  (1:1)
-- ---------------------------------------------------------------------------
create table tenant_contact (
  tenant_id      uuid primary key references tenants on delete cascade,
  whatsapp_phone text,                       -- E.164 digits, no '+', e.g. 5215555555555
  address        text,
  hours          jsonb,
  instagram      text,
  facebook       text,
  website        text,
  email          text,
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
create table categories (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants on delete cascade,
  name             text not null,
  position         integer not null default 0,
  banner_image_url text,
  banner_name      text,
  is_visible       boolean not null default true,
  created_at       timestamptz not null default now()
);
create index categories_tenant_idx on categories (tenant_id, position);

-- ---------------------------------------------------------------------------
-- products  (image_url + price both nullable on purpose)
-- ---------------------------------------------------------------------------
create table products (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants on delete cascade,
  category_id  uuid not null references categories on delete cascade,
  name         text not null,
  description  text,
  price        numeric(10,2),
  show_price   boolean not null default true,  -- per-product override of theme.show_prices
  image_url    text,
  is_available boolean not null default true,
  position     integer not null default 0,
  tags         jsonb not null default '[]',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index products_category_idx on products (category_id, position);
create index products_tenant_idx   on products (tenant_id);

-- ---------------------------------------------------------------------------
-- separators  (interleaved with products by `position` within a category)
-- ---------------------------------------------------------------------------
create table separators (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants on delete cascade,
  category_id uuid not null references categories on delete cascade,
  label       text,
  style       separator_style not null default 'line',
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index separators_category_idx on separators (category_id, position);

-- ---------------------------------------------------------------------------
-- product_views  (raw analytics; aggregated by query for the dashboard)
-- ---------------------------------------------------------------------------
create table product_views (
  id         bigint generated always as identity primary key,
  tenant_id  uuid not null references tenants on delete cascade,
  product_id uuid not null references products on delete cascade,
  viewed_at  timestamptz not null default now()
);
create index product_views_tenant_idx on product_views (tenant_id, viewed_at);
create index product_views_product_idx on product_views (product_id);

-- ---------------------------------------------------------------------------
-- orders  (logged when a WhatsApp message is generated — not a payment)
-- ---------------------------------------------------------------------------
create table orders (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants on delete cascade,
  items         jsonb not null,
  total         numeric(10,2),
  customer_name text,
  note          text,
  channel       text not null default 'whatsapp',
  created_at    timestamptz not null default now()
);
create index orders_tenant_idx on orders (tenant_id, created_at);

-- ---------------------------------------------------------------------------
-- subscriptions  (1:1 with tenant)
-- ---------------------------------------------------------------------------
create table subscriptions (
  tenant_id           uuid primary key references tenants on delete cascade,
  status              subscription_status not null default 'trialing',
  trial_ends_at       timestamptz,
  current_period_end  timestamptz,
  mp_preapproval_id   text,
  mp_payer_email      text,
  free_months_granted integer not null default 0,
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- audit_log  (super-admin actions, e.g. awarding free months)
-- ---------------------------------------------------------------------------
create table audit_log (
  id         bigint generated always as identity primary key,
  actor_id   uuid references auth.users on delete set null,
  tenant_id  uuid references tenants on delete set null,
  action     text not null,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- Helper functions (security definer; used by RLS policies)
-- ===========================================================================
create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'super_admin'
  );
$$;

create or replace function public.owns_tenant(t uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from tenants where id = t and owner_id = auth.uid()
  );
$$;

-- ===========================================================================
-- Triggers
-- ===========================================================================

-- Auto-create a profile when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-provision theme/contact/subscription rows for a new tenant, with a 30-day trial.
create or replace function public.handle_new_tenant()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.tenant_theme   (tenant_id) values (new.id);
  insert into public.tenant_contact (tenant_id) values (new.id);
  insert into public.subscriptions  (tenant_id, status, trial_ends_at)
    values (new.id, 'trialing', now() + interval '30 days');
  return new;
end;
$$;

create trigger on_tenant_created
  after insert on tenants
  for each row execute function public.handle_new_tenant();

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================
alter table profiles       enable row level security;
alter table tenants        enable row level security;
alter table tenant_theme   enable row level security;
alter table tenant_contact enable row level security;
alter table categories     enable row level security;
alter table products       enable row level security;
alter table separators     enable row level security;
alter table product_views  enable row level security;
alter table orders         enable row level security;
alter table subscriptions  enable row level security;
alter table audit_log      enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_self_select on profiles for select
  using (id = auth.uid() or public.is_super_admin());
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- tenants -------------------------------------------------------------------
create policy tenants_owner_select on tenants for select
  using (owner_id = auth.uid() or public.is_super_admin());
create policy tenants_owner_insert on tenants for insert
  with check (owner_id = auth.uid());
create policy tenants_owner_update on tenants for update
  using (owner_id = auth.uid() or public.is_super_admin())
  with check (owner_id = auth.uid() or public.is_super_admin());
create policy tenants_owner_delete on tenants for delete
  using (owner_id = auth.uid() or public.is_super_admin());

-- Generic owner-or-super-admin policy for each tenant-scoped child table.
-- (Written out per-table because policy bodies cannot be parameterized.)
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'tenant_theme','tenant_contact','categories','products',
    'separators','product_views','orders','subscriptions'
  ] loop
    execute format($f$
      create policy %1$s_owner_all on %1$s for all
        using (public.owns_tenant(tenant_id) or public.is_super_admin())
        with check (public.owns_tenant(tenant_id) or public.is_super_admin());
    $f$, tbl);
  end loop;
end $$;

-- audit_log -----------------------------------------------------------------
create policy audit_super_select on audit_log for select
  using (public.is_super_admin());
create policy audit_super_insert on audit_log for insert
  with check (public.is_super_admin());

-- ===========================================================================
-- Storage bucket for all tenant media (public read; owners write under their id)
-- ===========================================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy "media public read" on storage.objects for select
  using (bucket_id = 'media');
create policy "media authed write" on storage.objects for insert to authenticated
  with check (bucket_id = 'media');
create policy "media authed update" on storage.objects for update to authenticated
  using (bucket_id = 'media');
create policy "media authed delete" on storage.objects for delete to authenticated
  using (bucket_id = 'media');
