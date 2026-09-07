-- Kuik — a branch is a paid line: 250/month on Menú, 499/month on Restaurante
--
-- Until now branches were free and unlimited on the higher tier and absent
-- from the lower one. Each branch now adds its own amount to the monthly
-- charge, on either tier (lib/pricing.ts), and the MercadoPago preapproval is
-- updated when a branch is added or removed (app/(dashboard)/branches).
-- "Restaurante adicional" (extra_amount, 0016) stays what it was: a whole
-- separate restaurant on the same account.

alter table platform_settings
  add column if not exists branch_amount_basic numeric(10,2) not null default 250,
  add column if not exists branch_amount_pro   numeric(10,2) not null default 499;
