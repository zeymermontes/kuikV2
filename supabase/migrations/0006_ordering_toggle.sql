-- Kuik — showcase vs. online-ordering toggle
-- When false, the public menu is display-only: no cart, no add buttons, no
-- WhatsApp ordering. Defaults to true (ordering enabled).

alter table tenant_ordering
  add column ordering_enabled boolean not null default true;
