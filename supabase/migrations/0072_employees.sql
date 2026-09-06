-- Kuik — employees with a PIN, permissions and a time clock
--
-- A restaurant's POS tablet is signed in once, with the owner's account, and
-- shared by everyone on the floor. Until now "who took this order" was a
-- free-text name typed on the device. Loyverse and Square do what every
-- register has done for decades: each employee has a PIN, opens the sale
-- with it, and the till knows who did what.
--
--   employees     the people (not login accounts): name, role, PIN, permissions
--   time_entries  the clock: one row per shift worked, in and out
--
-- Employees are pulled into the POS's offline store so a PIN still works with
-- the internet down; that is why the PIN travels as a hash and never as text.
-- Sales and payments carry `employee_id` for reports by person.

create table if not exists employees (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants on delete cascade,
  name        text not null,
  role        text not null default 'waiter' check (role in ('manager', 'cashier', 'waiter')),
  -- sha256 hex of "<tenant_id>:<pin>"; null = tap the name to sign in, no PIN.
  pin_hash    text,
  -- Per-person overrides of the role's defaults: {"discount": true, "void": false, ...}
  perms       jsonb not null default '{}'::jsonb,
  color       text,
  active      boolean not null default true,
  position    int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists employees_tenant_idx on employees (tenant_id, position);

alter table employees enable row level security;

do $$ begin
  -- The POS needs the list (and the hashes) to sign people in; managing it is a manager's job.
  if not exists (select 1 from pg_policies where tablename = 'employees' and policyname = 'employees_read') then
    create policy employees_read on employees for select
      using (public.can_operate_pos(tenant_id) or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'employees' and policyname = 'employees_write') then
    create policy employees_write on employees for all
      using (public.can_manage_menu(tenant_id) or public.is_super_admin())
      with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- ── The clock ───────────────────────────────────────────────────────────────
-- Client-generated ids and the POS's updated_at clock: entries are written on
-- the device and travel through the same offline outbox as sales.
create table if not exists time_entries (
  id           uuid primary key,
  tenant_id    uuid not null references tenants on delete cascade,
  employee_id  uuid not null references employees on delete cascade,
  clock_in     timestamptz not null,
  clock_out    timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists time_entries_tenant_idx on time_entries (tenant_id, clock_in desc);
create index if not exists time_entries_employee_idx on time_entries (employee_id, clock_in desc);

alter table time_entries enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'time_entries' and policyname = 'time_entries_pos_all') then
    create policy time_entries_pos_all on time_entries for all
      using (public.can_operate_pos(tenant_id) or public.is_super_admin())
      with check (public.can_operate_pos(tenant_id) or public.is_super_admin());
  end if;
end $$;

drop trigger if exists time_entries_guard on time_entries;
create trigger time_entries_guard before update on time_entries
  for each row execute function public.guard_updated_at();

-- Both tables stream to the POS like the rest of its data (lib/pos/sync.ts).
alter table employees replica identity full;
alter table time_entries replica identity full;
do $$ declare tbl text; begin
  foreach tbl in array array['employees', 'time_entries'] loop
    if not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl) then
      execute format('alter publication supabase_realtime add table %I', tbl);
    end if;
  end loop;
end $$;

-- ── Who did what ────────────────────────────────────────────────────────────
alter table tabs            add column if not exists employee_id uuid references employees on delete set null;
alter table payments        add column if not exists employee_id uuid references employees on delete set null;
alter table kitchen_tickets add column if not exists employee_id uuid references employees on delete set null;

create index if not exists tabs_employee_idx     on tabs (tenant_id, employee_id) where employee_id is not null;
create index if not exists payments_employee_idx on payments (tenant_id, employee_id) where employee_id is not null;

-- ── Settings ────────────────────────────────────────────────────────────────
-- pos_lock_after_sale: once a sale closes, the register asks for a PIN again
-- (a shared tablet that several waiters pick up in turn).
alter table tenant_ordering
  add column if not exists pos_lock_after_sale boolean not null default false;
