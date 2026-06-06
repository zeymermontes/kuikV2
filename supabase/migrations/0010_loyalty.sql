-- Kuik — loyalty program
-- Restaurant picks stamps OR points. Customers identify by phone and get a member
-- code/QR they show in store; staff awards/redeems from the admin. Decoupled from
-- the WhatsApp order flow (so it can't be gamed by fake orders).

create type loyalty_type as enum ('stamps', 'points');

create table loyalty_program (
  tenant_id                 uuid primary key references tenants on delete cascade,
  enabled                   boolean not null default false,
  type                      loyalty_type not null default 'stamps',
  -- stamps mode
  stamps_needed             integer not null default 10,
  reward_description        text,            -- "Un postre gratis"
  -- points mode
  points_per_currency       numeric(10,4) not null default 1,  -- points earned per $1 spent
  points_for_reward         integer,         -- points needed to redeem (for display)
  points_reward_description text,
  updated_at                timestamptz not null default now()
);

create table loyalty_customers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants on delete cascade,
  phone        text not null,                -- identity (digits, E.164-ish)
  name         text,
  code         text not null,                -- short member code shown as QR
  stamps       integer not null default 0,
  points       numeric(10,2) not null default 0,
  total_visits integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (tenant_id, phone),
  unique (tenant_id, code)
);
create index loyalty_customers_code_idx on loyalty_customers (tenant_id, code);

create table loyalty_events (
  id          bigint generated always as identity primary key,
  tenant_id   uuid not null references tenants on delete cascade,
  customer_id uuid not null references loyalty_customers on delete cascade,
  kind        text not null,                 -- 'earn' | 'redeem'
  stamps_delta integer not null default 0,
  points_delta numeric(10,2) not null default 0,
  amount      numeric(10,2),                 -- sale amount (points mode)
  created_at  timestamptz not null default now()
);
create index loyalty_events_customer_idx on loyalty_events (customer_id, created_at);

alter table loyalty_program   enable row level security;
alter table loyalty_customers enable row level security;
alter table loyalty_events    enable row level security;

create policy loyalty_program_owner_all on loyalty_program for all
  using (public.owns_tenant(tenant_id) or public.is_super_admin())
  with check (public.owns_tenant(tenant_id) or public.is_super_admin());
create policy loyalty_customers_owner_all on loyalty_customers for all
  using (public.owns_tenant(tenant_id) or public.is_super_admin())
  with check (public.owns_tenant(tenant_id) or public.is_super_admin());
create policy loyalty_events_owner_all on loyalty_events for all
  using (public.owns_tenant(tenant_id) or public.is_super_admin())
  with check (public.owns_tenant(tenant_id) or public.is_super_admin());

-- Provision a program row for existing + future tenants.
insert into loyalty_program (tenant_id)
  select id from tenants on conflict (tenant_id) do nothing;

create or replace function public.handle_new_tenant()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.tenant_theme    (tenant_id) values (new.id);
  insert into public.tenant_contact  (tenant_id) values (new.id);
  insert into public.tenant_ordering (tenant_id) values (new.id);
  insert into public.tenant_landing  (tenant_id) values (new.id);
  insert into public.loyalty_program (tenant_id) values (new.id);
  insert into public.subscriptions   (tenant_id, status, trial_ends_at)
    values (new.id, 'trialing', now() + interval '30 days');
  return new;
end;
$$;
