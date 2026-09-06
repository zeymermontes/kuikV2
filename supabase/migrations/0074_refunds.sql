-- Kuik — refunds
--
-- At the register a refund is a payment with a negative amount, marked
-- kind = 'refund', tied to the sale it undoes. That is how a till has always
-- worked: cash goes back out of the drawer, and the shift's expected cash
-- and the Z report add it in without any special case. The sale keeps its
-- history and its receipt; `tabs.refunded` says how much of it came back.
--
-- An online order paid through a gateway is refunded at the gateway and the
-- order remembers the refund's reference and amount.

alter table payments
  add column if not exists kind      text not null default 'sale' check (kind in ('sale', 'refund')),
  add column if not exists reason    text,
  -- The payment being (partly) returned, when the cashier picked one.
  add column if not exists refund_of uuid references payments on delete set null,
  -- What was returned: {"items": [{"name": "...", "qty": 1, "amount": 120}]}
  add column if not exists detail    jsonb;

alter table tabs
  add column if not exists refunded numeric(10,2) not null default 0;

alter table orders
  add column if not exists refund_ref      text,
  add column if not exists refunded_at     timestamptz,
  add column if not exists amount_refunded numeric(10,2);
