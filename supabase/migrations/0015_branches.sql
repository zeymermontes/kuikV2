-- Kuik — branches / sucursales (Pro)
-- A tenant can have multiple branches, each with its own WhatsApp/address. A
-- branch's menu is either 'shared' (the main menu) or 'independent' (its own).
-- Independent menus live on categories tagged with branch_id; products/separators
-- inherit the branch through their category. branch_id NULL = the main menu.

create table branches (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants on delete cascade,
  name           text not null,
  slug           text not null,
  whatsapp_phone text,
  address        text,
  menu_mode      text not null default 'shared' check (menu_mode in ('shared', 'independent')),
  is_visible     boolean not null default true,
  position       integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index branches_tenant_idx on branches (tenant_id, position);

alter table categories
  add column branch_id uuid references branches on delete cascade;  -- NULL = main menu
create index categories_branch_idx on categories (tenant_id, branch_id, position);

alter table branches enable row level security;

create policy branches_read on branches for select
  using (is_member(tenant_id) or is_super_admin());
create policy branches_write on branches for all
  using (can_manage_menu(tenant_id) or is_super_admin())
  with check (can_manage_menu(tenant_id) or is_super_admin());
