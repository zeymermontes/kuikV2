-- Kuik — POS + KDS schema (offline-first)
-- Tabs/checks, line items, payments, register shifts, and kitchen tickets.
-- All POS entities use client-generated UUIDs and an `updated_at` last-write-wins
-- clock; the dashboard/terminals write directly via supabase-js under RLS.

-- ── Cashier role + permission helpers ──────────────────────────────────────
alter type member_role add value if not exists 'cashier';

-- Compare role::text to avoid using a freshly-added enum value in this txn.
create or replace function public.can_operate_pos(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members
    where tenant_id = t and user_id = auth.uid()
      and role::text in ('owner', 'manager', 'cashier', 'waiter')
  );
$$;

create or replace function public.can_manage_register(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members
    where tenant_id = t and user_id = auth.uid()
      and role::text in ('owner', 'manager', 'cashier')
  );
$$;

-- ── Last-write-wins guard: ignore stale upserts ────────────────────────────
create or replace function public.guard_updated_at()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return old; -- incoming change is older than what we have; keep current row
  end if;
  return new;
end;
$$;

-- ── Tables ─────────────────────────────────────────────────────────────────
create table tabs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants on delete cascade,
  branch_id     uuid references branches on delete set null,
  table_label   text,
  customer_name text,
  status        text not null default 'open' check (status in ('open','held','paid','void')),
  opened_by     uuid,
  opened_at     timestamptz not null default now(),
  closed_at     timestamptz,
  subtotal      numeric(10,2) not null default 0,
  tip           numeric(10,2) not null default 0,
  total         numeric(10,2) not null default 0,
  shift_id      uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index tabs_tenant_idx on tabs (tenant_id, status, updated_at desc);

create table tab_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants on delete cascade,
  tab_id      uuid not null references tabs on delete cascade,
  product_id  uuid,
  name        text not null,
  qty         int not null default 1,
  base_price  numeric(10,2) not null default 0,
  selections  jsonb not null default '[]'::jsonb,
  note        text,
  line_total  numeric(10,2) not null default 0,
  course      int not null default 1,
  seat        int,
  fired_at    timestamptz,
  ticket_id   uuid,
  voided_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index tab_items_tab_idx on tab_items (tab_id);
create index tab_items_tenant_idx on tab_items (tenant_id, updated_at desc);

create table payments (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants on delete cascade,
  tab_id     uuid not null references tabs on delete cascade,
  method     text not null check (method in ('cash','card','transfer','other')),
  amount     numeric(10,2) not null,
  tip        numeric(10,2) not null default 0,
  tendered   numeric(10,2),
  change     numeric(10,2),
  shift_id   uuid,
  taken_by   uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_tab_idx on payments (tab_id);
create index payments_shift_idx on payments (tenant_id, shift_id);

create table register_shifts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants on delete cascade,
  branch_id     uuid references branches on delete set null,
  opened_by     uuid,
  opened_at     timestamptz not null default now(),
  opening_cash  numeric(10,2) not null default 0,
  closed_by     uuid,
  closed_at     timestamptz,
  closing_cash  numeric(10,2),
  expected_cash numeric(10,2),
  over_short    numeric(10,2),
  status        text not null default 'open' check (status in ('open','closed')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index register_shifts_tenant_idx on register_shifts (tenant_id, status);

create table kitchen_tickets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants on delete cascade,
  branch_id   uuid references branches on delete set null,
  tab_id      uuid references tabs on delete cascade,
  station     text,
  table_label text,
  status      text not null default 'new' check (status in ('new','preparing','ready','served')),
  fired_by    uuid,
  fired_at    timestamptz not null default now(),
  items       jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index kitchen_tickets_idx on kitchen_tickets (tenant_id, station, status, fired_at);

-- ── RLS + LWW trigger + realtime (loop over the POS tables) ─────────────────
do $$
declare tbl text;
begin
  foreach tbl in array array['tabs','tab_items','payments','register_shifts','kitchen_tickets'] loop
    execute format('alter table %I enable row level security', tbl);
    execute format($f$
      create policy %1$s_pos_all on %1$s for all
        using (public.can_operate_pos(tenant_id) or public.is_super_admin())
        with check (public.can_operate_pos(tenant_id) or public.is_super_admin());
    $f$, tbl);
    execute format('create trigger %1$s_guard before update on %1$s
      for each row execute function public.guard_updated_at()', tbl);
    execute format('alter table %I replica identity full', tbl);
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table %I', tbl);
    end if;
  end loop;
end $$;
