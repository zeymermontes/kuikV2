-- Kuik — plan tiers (basic / pro)
-- Basic = everything except custom domain, loyalty, branches and pro reports.
-- Pro = those extras. Trial users get Pro-level access while trialing.

-- Pro pricing lives alongside the existing (basic) price in platform_settings.
alter table platform_settings
  add column pro_amount numeric(10,2) not null default 399,
  add column pro_name   text not null default 'Kuik Pro';

-- The existing plan_amount / plan_name now represent the BASIC plan.
update platform_settings set plan_name = 'Kuik Básico' where plan_name = 'Kuik Pro';

-- Each subscription is on a tier.
alter table subscriptions
  add column plan text not null default 'basic' check (plan in ('basic', 'pro'));
