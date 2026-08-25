-- Kuik — per-channel ordering
-- The same menu is reached two ways: from a table QR inside the restaurant
-- ("qr") and from a link shared online ("online"). A restaurant may want the
-- cart on one and a plain look-only menu on the other — e.g. QR guests order
-- with the waiter, while online guests send a WhatsApp order.
-- Both default to true so existing menus behave exactly as before.

alter table tenant_ordering
  add column ordering_qr_enabled     boolean not null default true,
  add column ordering_online_enabled boolean not null default true;
