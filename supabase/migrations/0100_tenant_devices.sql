-- Kuik — devices: a tablet, a register or a kitchen screen joins a restaurant
-- with a one-time code instead of somebody's email and password.
--
-- Until now a shared tablet was signed in with a real account, in practice the
-- owner's: the most powerful login of the restaurant, typed into the device
-- everyone touches, and impossible to take back from one tablet without
-- changing the password on all of them.
--
-- The owner now names the device, picks what it may do and where, and gets a
-- code. Whoever types the code on the device is in. Behind it the server
-- creates a login that belongs to the device alone (no mailbox, a password
-- nobody ever sees) and makes it a member of the restaurant with that role,
-- so every policy already written for members applies to it unchanged.
-- Revoking a device deletes that login; its membership goes with it.

create table if not exists tenant_devices (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  -- What a shared device may be. Never owner or manager: nobody is
  -- accountable for what is done from a login with no person behind it.
  role            member_role not null default 'cashier'
                    check (role in ('cashier', 'waiter', 'host')),
  -- Where it works; null = the main location.
  branch_id       uuid references branches on delete set null,
  -- sha256 hex of the pending code. The code itself is shown once, to the
  -- owner, and is never stored. Null once used or cancelled.
  code_hash       text,
  code_expires_at timestamptz,
  -- The login created when the code was used. Null while it waits.
  user_id         uuid references auth.users on delete set null,
  linked_at       timestamptz,
  last_seen_at    timestamptz,
  created_by      uuid references auth.users on delete set null,
  created_at      timestamptz not null default now()
);

create index if not exists tenant_devices_tenant_idx on tenant_devices (tenant_id, created_at);
-- A code is looked up on its own, before anyone is signed in.
create unique index if not exists tenant_devices_code_idx on tenant_devices (code_hash) where code_hash is not null;
create unique index if not exists tenant_devices_user_idx on tenant_devices (user_id) where user_id is not null;

alter table tenant_devices enable row level security;

-- Read only, for everyone. Rows are written by the server alone (service
-- role, after it has checked the caller owns the restaurant): `user_id` names
-- the login that revoking a device deletes, and a row an owner could write
-- directly would let them point it at somebody else's account.
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tenant_devices' and policyname = 'tenant_devices_owner_read') then
    create policy tenant_devices_owner_read on tenant_devices for select
      using (public.owns_tenant(tenant_id) or public.is_super_admin());
  end if;
  -- The device reads its own row: the hub needs the branch it was given.
  if not exists (select 1 from pg_policies where tablename = 'tenant_devices' and policyname = 'tenant_devices_self') then
    create policy tenant_devices_self on tenant_devices for select
      using (user_id = auth.uid());
  end if;
end $$;
