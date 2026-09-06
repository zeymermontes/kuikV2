-- Kuik — online payment for menu orders
--
-- An order placed from the public menu can now be paid before it reaches the
-- restaurant over WhatsApp. The guest picks "Pagar en línea", Kuik creates the
-- order with payment_status = 'pending' and sends them to the gateway's
-- checkout; the gateway's webhook flips it to 'paid'. The order board shows the
-- state live, and a paid order fires kitchen tickets so the KDS sees it too.
--
-- Gateways plug into lib/payments/: a tenant connects one account (Stripe
-- Connect today), the fee Kuik keeps per payment is a platform setting.

-- ── Where the money goes ────────────────────────────────────────────────────
create table if not exists payment_accounts (
  tenant_id          uuid primary key references tenants on delete cascade,
  provider           text not null default 'stripe' check (provider in ('stripe')),
  account_id         text not null,
  -- Both flip true once the gateway has verified the business; until then
  -- the cart does not offer online payment even if the method is on.
  charges_enabled    boolean not null default false,
  details_submitted  boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create unique index if not exists payment_accounts_account_idx on payment_accounts (provider, account_id);

alter table payment_accounts enable row level security;

do $$ begin
  -- Managers see the connection state; the rows themselves are written by the
  -- server (service role) from the gateway's answers, never from the browser.
  if not exists (select 1 from pg_policies where tablename = 'payment_accounts' and policyname = 'payment_accounts_read') then
    create policy payment_accounts_read on payment_accounts for select
      using (public.can_manage_menu(tenant_id) or public.is_super_admin());
  end if;
end $$;

-- ── The order's payment ─────────────────────────────────────────────────────
-- payment_status: none (paid at the counter / on WhatsApp), pending (checkout
-- opened), paid, failed, refunded.
alter table orders
  add column if not exists payment_status   text not null default 'none'
    check (payment_status in ('none', 'pending', 'paid', 'failed', 'refunded')),
  add column if not exists payment_provider text,
  -- The gateway's id for the checkout (a Stripe Checkout Session); webhooks find the order by it.
  add column if not exists payment_ref      text,
  add column if not exists paid_at          timestamptz,
  add column if not exists amount_paid      numeric(10,2),
  add column if not exists currency         text,
  -- Full customer-facing text of the order, kept so the paid confirmation can
  -- re-send it to WhatsApp from any device.
  add column if not exists updated_at       timestamptz not null default now();

create index if not exists orders_payment_ref_idx on orders (payment_ref) where payment_ref is not null;

-- ── The cart may offer it ───────────────────────────────────────────────────
alter table tenant_ordering
  drop constraint if exists tenant_ordering_payment_methods_check;
alter table tenant_ordering
  add constraint tenant_ordering_payment_methods_check
    check (payment_methods <@ array['cash', 'transfer', 'card', 'onsite', 'online']::text[]);

-- ── What Kuik keeps ─────────────────────────────────────────────────────────
-- Percentage of each online payment taken as an application fee, on top of the
-- gateway's own fee (which the restaurant pays). 0 = Kuik keeps nothing.
alter table platform_settings
  add column if not exists payment_fee_percent numeric(5,2) not null default 0
    check (payment_fee_percent >= 0 and payment_fee_percent <= 30);
