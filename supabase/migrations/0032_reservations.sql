-- Kuik — table reservations
-- Diners request a reservation from the public menu; staff confirm/cancel it.

create table reservations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants on delete cascade,
  branch_id     uuid references branches on delete set null,
  customer_name text not null,
  phone         text,
  party_size    int  not null default 2,
  date          date not null,
  "time"        text not null,                 -- "HH:MM"
  note          text,
  status        text not null default 'pending', -- pending | confirmed | seated | cancelled
  created_at    timestamptz not null default now()
);
create index reservations_tenant_idx on reservations (tenant_id, date, "time");

alter table reservations enable row level security;

-- Members manage their tenant's reservations (read + update + cancel).
-- Public requests are inserted server-side with the service role (bypasses RLS).
create policy reservations_manage on reservations for all
  using (public.is_member(tenant_id) or public.is_super_admin())
  with check (public.is_member(tenant_id) or public.is_super_admin());

-- Toggle: accept reservations from the public menu.
alter table tenant_contact
  add column reservations_enabled boolean not null default false;
