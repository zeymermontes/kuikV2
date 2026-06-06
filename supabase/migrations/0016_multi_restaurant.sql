-- Kuik — multiple restaurants per account
-- A Pro user can own several restaurants. Each restaurant is still its own tenant
-- with its own subscription. Additional restaurants are billed at a flat extra
-- rate (no trial). Super-admins never pay.

alter table subscriptions
  add column is_additional boolean not null default false;

alter table platform_settings
  add column extra_amount numeric(10,2) not null default 299;
