-- Kuik — how a restaurant learns about a new order
--
-- A WhatsApp order announces itself: the guest's message lands on the
-- restaurant's phone. An order paid online does not — the money arrives, the
-- row appears on the board, and nobody is told. `order_alerts` holds the
-- restaurant's choices (push, sound, print, WhatsApp to the team, confirm the
-- guest, escalation); lib/orders/alerts.ts defines the shape and defaults.
alter table tenant_ordering
  add column if not exists order_alerts jsonb not null default '{}'::jsonb;

-- accepted_at: when staff first advanced the order (the escalation stops).
-- alert_level: how far the escalation got (0 none, 1 nudged, 2 escalated),
-- so the cron never repeats itself.
alter table orders
  add column if not exists accepted_at timestamptz,
  add column if not exists alert_level int not null default 0;

create index if not exists orders_unaccepted_idx on orders (created_at)
  where status = 'new' and payment_status = 'paid' and alert_level < 2;
