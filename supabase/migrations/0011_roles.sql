-- Kuik — staff roles (owner / manager / waiter)
-- A tenant can now have multiple users. Owner = full control; manager = + edit
-- menu; waiter = product availability + loyalty only. Staff join via email invite.

create type member_role as enum ('owner', 'manager', 'waiter');

create table tenant_members (
  tenant_id  uuid not null references tenants on delete cascade,
  user_id    uuid not null references auth.users on delete cascade,
  role       member_role not null default 'waiter',
  email      text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);
create index tenant_members_user_idx on tenant_members (user_id);

create table tenant_invites (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants on delete cascade,
  email       text not null,
  role        member_role not null default 'waiter',
  created_at  timestamptz not null default now(),
  accepted_at timestamptz,
  unique (tenant_id, email)
);

-- ── Helper functions ─────────────────────────────────────────────────────────
create or replace function public.is_member(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tenant_members where tenant_id = t and user_id = auth.uid());
$$;

create or replace function public.can_manage_menu(t uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tenant_members
    where tenant_id = t and user_id = auth.uid() and role in ('owner', 'manager')
  );
$$;

-- Backfill: every existing owner becomes an owner-member.
insert into tenant_members (tenant_id, user_id, role, email)
  select t.id, t.owner_id, 'owner', u.email
  from tenants t join auth.users u on u.id = t.owner_id
  on conflict (tenant_id, user_id) do nothing;

-- New tenants: add the owner as a member too.
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
  insert into public.tenant_members  (tenant_id, user_id, role, email)
    select new.id, new.owner_id, 'owner', email from auth.users where id = new.owner_id;
  return new;
end;
$$;

-- Claim any pending invites matching the signed-in user's email (run on login).
create or replace function public.claim_pending_invites()
returns void language plpgsql security definer set search_path = public as $$
declare uemail text;
begin
  select lower(email) into uemail from auth.users where id = auth.uid();
  if uemail is null then return; end if;

  insert into tenant_members (tenant_id, user_id, role, email)
    select i.tenant_id, auth.uid(), i.role, uemail
    from tenant_invites i
    where lower(i.email) = uemail and i.accepted_at is null
    on conflict (tenant_id, user_id) do nothing;

  update tenant_invites set accepted_at = now()
    where lower(email) = uemail and accepted_at is null;
end;
$$;

-- Waiters can flip availability without full menu write access.
create or replace function public.set_product_availability(p_id uuid, p_available boolean)
returns void language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select tenant_id into t from products where id = p_id;
  if t is null then return; end if;
  if not (public.is_member(t) or public.is_super_admin()) then
    raise exception 'not allowed';
  end if;
  update products set is_available = p_available, updated_at = now() where id = p_id;
end;
$$;

-- ── RLS: members can read; writes gated by role ──────────────────────────────
alter table tenant_members enable row level security;
alter table tenant_invites enable row level security;

create policy members_read on tenant_members for select
  using (is_member(tenant_id) or is_super_admin());
create policy members_manage on tenant_members for all
  using (owns_tenant(tenant_id) or is_super_admin())
  with check (owns_tenant(tenant_id) or is_super_admin());

create policy invites_owner_all on tenant_invites for all
  using (owns_tenant(tenant_id) or is_super_admin())
  with check (owns_tenant(tenant_id) or is_super_admin());

-- Menu content: members read; managers/owners write.
do $$
declare tbl text;
begin
  foreach tbl in array array['products', 'categories', 'separators'] loop
    execute format('drop policy if exists %1$s_owner_all on %1$s', tbl);
    execute format($f$
      create policy %1$s_read on %1$s for select
        using (is_member(tenant_id) or is_super_admin());
    $f$, tbl);
    execute format($f$
      create policy %1$s_write on %1$s for insert
        with check (can_manage_menu(tenant_id) or is_super_admin());
    $f$, tbl);
    execute format($f$
      create policy %1$s_update on %1$s for update
        using (can_manage_menu(tenant_id) or is_super_admin())
        with check (can_manage_menu(tenant_id) or is_super_admin());
    $f$, tbl);
    execute format($f$
      create policy %1$s_delete on %1$s for delete
        using (can_manage_menu(tenant_id) or is_super_admin());
    $f$, tbl);
  end loop;
end $$;

-- Settings tables: members read; owner writes.
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'tenant_theme', 'tenant_contact', 'tenant_ordering', 'tenant_landing', 'loyalty_program'
  ] loop
    execute format('drop policy if exists %1$s_owner_all on %1$s', tbl);
    execute format($f$
      create policy %1$s_read on %1$s for select
        using (is_member(tenant_id) or is_super_admin());
    $f$, tbl);
    execute format($f$
      create policy %1$s_owner on %1$s for all
        using (owns_tenant(tenant_id) or is_super_admin())
        with check (owns_tenant(tenant_id) or is_super_admin());
    $f$, tbl);
  end loop;
end $$;

-- Loyalty members + events: any staff member may read/write (accreditation).
do $$
declare tbl text;
begin
  foreach tbl in array array['loyalty_customers', 'loyalty_events'] loop
    execute format('drop policy if exists %1$s_owner_all on %1$s', tbl);
    execute format($f$
      create policy %1$s_member_all on %1$s for all
        using (is_member(tenant_id) or is_super_admin())
        with check (is_member(tenant_id) or is_super_admin());
    $f$, tbl);
  end loop;
end $$;

-- Read-only-for-members tables (writes happen via service role / owner).
do $$
declare tbl text;
begin
  foreach tbl in array array['subscriptions', 'product_views', 'orders'] loop
    execute format('drop policy if exists %1$s_owner_all on %1$s', tbl);
    execute format($f$
      create policy %1$s_read on %1$s for select
        using (is_member(tenant_id) or is_super_admin());
    $f$, tbl);
  end loop;
end $$;

create policy subscriptions_owner on subscriptions for all
  using (owns_tenant(tenant_id) or is_super_admin())
  with check (owns_tenant(tenant_id) or is_super_admin());

-- tenants: members can see their tenant; owner keeps write.
drop policy if exists tenants_owner_select on tenants;
create policy tenants_member_select on tenants for select
  using (is_member(id) or is_super_admin());
