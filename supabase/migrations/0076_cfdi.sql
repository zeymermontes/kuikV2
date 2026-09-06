-- Kuik — facturación CFDI 4.0
--
-- Mexican restaurants must hand a CFDI (a SAT-stamped electronic invoice) to
-- any guest who asks, and file a global CFDI for everything else. Kuik stamps
-- through a PAC (Facturama, multi-issuer API: one Kuik account, one CSD per
-- restaurant). The restaurant enters its fiscal data and uploads its CSD once;
-- guests request their own invoice from the receipt's link with the order
-- number; the manager issues, cancels and downloads from the dashboard.
--
--   tenant_cfdi   fiscal identity + defaults (regime, zip, IVA, serie) + CSD status
--   invoices      every CFDI issued or attempted, with the PAC's id and the SAT uuid

create table if not exists tenant_cfdi (
  tenant_id        uuid primary key references tenants on delete cascade,
  enabled          boolean not null default false,
  rfc              text,
  legal_name       text,
  -- SAT catalogue c_RegimenFiscal: 601 general, 612 persona física, 626 RESICO…
  fiscal_regime    text,
  -- Lugar de expedición and the issuer's TaxZipCode.
  zip_code         text,
  -- IVA rate on menu prices, which already include it: 16, 8 (border) or 0.
  iva_percent      numeric(5,2) not null default 16,
  serie            text not null default 'A',
  next_folio       int not null default 1,
  -- SAT product/unit defaults for concepts: restaurant service.
  product_code     text not null default '90101500',
  unit_code        text not null default 'E48',
  -- Whether guests may request their own CFDI from the receipt.
  self_invoice     boolean not null default true,
  -- Whether the restaurant wants a daily global CFDI for unclaimed sales (issued from the dashboard).
  global_daily     boolean not null default false,
  -- The CSD registered with the PAC: set when the upload succeeded, never the key itself.
  csd_registered_at timestamptz,
  csd_expires_at   date,
  csd_serial       text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table tenant_cfdi enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'tenant_cfdi' and policyname = 'tenant_cfdi_manage') then
    create policy tenant_cfdi_manage on tenant_cfdi for all
      using (public.can_manage_menu(tenant_id) or public.is_super_admin())
      with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

create table if not exists invoices (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants on delete cascade,
  -- What it invoices: an online order, a register sale, or a day (global).
  order_id      uuid references orders on delete set null,
  tab_id        uuid references tabs on delete set null,
  kind          text not null default 'ingreso' check (kind in ('ingreso', 'global')),
  period_date   date,
  status        text not null default 'pending' check (status in ('pending', 'stamped', 'cancelled', 'error')),
  serie         text,
  folio         int,
  -- The SAT's uuid (folio fiscal) and the PAC's own document id.
  uuid          text,
  provider      text not null default 'facturama',
  provider_id   text,
  receiver      jsonb not null,
  items         jsonb not null,
  payment_form  text not null default '01',
  subtotal      numeric(12,2) not null default 0,
  tax           numeric(12,2) not null default 0,
  total         numeric(12,2) not null default 0,
  email         text,
  error         text,
  -- Who asked: 'guest' from the receipt link, 'staff' from the dashboard.
  requested_by  text not null default 'staff',
  created_at    timestamptz not null default now(),
  stamped_at    timestamptz,
  cancelled_at  timestamptz
);

create index if not exists invoices_tenant_idx on invoices (tenant_id, created_at desc);
create unique index if not exists invoices_order_idx on invoices (order_id) where order_id is not null and status in ('pending', 'stamped');
create unique index if not exists invoices_tab_idx on invoices (tab_id) where tab_id is not null and status in ('pending', 'stamped');

alter table invoices enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'invoices' and policyname = 'invoices_read') then
    create policy invoices_read on invoices for select
      using (public.can_operate_pos(tenant_id) or public.is_super_admin());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'invoices' and policyname = 'invoices_manage') then
    create policy invoices_manage on invoices for all
      using (public.can_manage_menu(tenant_id) or public.is_super_admin())
      with check (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- Per-product SAT codes when the restaurant's default does not fit (alcohol, retail goods).
alter table products
  add column if not exists sat_product_code text,
  add column if not exists sat_unit_code    text;

-- Folios are handed out atomically so two invoices never share one.
create or replace function public.next_invoice_folio(p_tenant uuid)
returns int language sql security definer set search_path = public as $$
  update tenant_cfdi set next_folio = next_folio + 1 where tenant_id = p_tenant returning next_folio - 1;
$$;
revoke execute on function public.next_invoice_folio(uuid) from anon, authenticated;

-- A sale knows the CFDI it is on (its own or the day's global), so it is never
-- invoiced twice and a guest asking late is told it went into the global one.
alter table orders add column if not exists invoice_id uuid references invoices on delete set null;
alter table tabs   add column if not exists invoice_id uuid references invoices on delete set null;
