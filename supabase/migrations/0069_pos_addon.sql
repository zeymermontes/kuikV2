-- Kuik — plans: Menú, Restaurante, and the point of sale as an add-on
--
-- Two tiers sell an outcome; the point of sale (register, kitchen screen,
-- printing, customer screen) is a separate operational commitment with its
-- own hardware and its own moment of purchase, so it is sold as an add-on that
-- joins either tier. The trial has everything.
alter table subscriptions
  add column if not exists addons text[] not null default '{}';

alter table platform_settings
  add column if not exists pos_addon_amount        numeric(10,2) not null default 499,
  add column if not exists pos_addon_name          text not null default 'Punto de venta',
  -- Kuik's cut of online payments on the higher tier; null = same as payment_fee_percent.
  add column if not exists pro_payment_fee_percent numeric(5,2);

-- The tiers are named after what they are for. Only the defaults are renamed;
-- a name the super admin typed is kept.
update platform_settings set plan_name = 'Menú' where id = 1 and plan_name in ('Kuik Básico', 'Básico');
update platform_settings set pro_name = 'Restaurante' where id = 1 and pro_name in ('Kuik Pro', 'Pro');
