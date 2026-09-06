-- Kuik — Mercado Pago as a second gateway for card payments from the menu
--
-- The restaurant links its own Mercado Pago account through OAuth; Kuik keeps
-- the seller's tokens to create Checkout Pro preferences on its behalf, with
-- Kuik's cut as the marketplace fee. One gateway per tenant, either one.
alter table payment_accounts drop constraint if exists payment_accounts_provider_check;
alter table payment_accounts add constraint payment_accounts_provider_check check (provider in ('stripe', 'mercadopago'));

-- The seller's OAuth credentials (access_token, refresh_token, expires_at,
-- public_key, live_mode). Written and read by the server only; never sent to
-- the browser (lib/payments publicAccount strips it).
alter table payment_accounts add column if not exists credentials jsonb;
