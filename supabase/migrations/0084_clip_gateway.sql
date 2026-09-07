-- Kuik — Clip as a third gateway for card payments from the menu
--
-- The restaurant pastes the API key and secret of an application it creates
-- on dashboard.clip.mx; Kuik creates a Clip Checkout link per order with them
-- (lib/payments/clip.ts). Money goes straight to the restaurant's Clip account.
-- `credentials` holds {api_key, secret}; account_id is the api_key.
alter table payment_accounts drop constraint if exists payment_accounts_provider_check;
alter table payment_accounts add constraint payment_accounts_provider_check check (provider in ('stripe', 'mercadopago', 'clip'));
