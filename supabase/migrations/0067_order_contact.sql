-- Kuik — a way to reach the guest who paid online
--
-- A WhatsApp order carries the guest's number by construction: they send it.
-- An order paid online may never be followed by that message, so the cart asks
-- for the number when the guest pays, and the board shows it.
alter table orders
  add column if not exists customer_phone text;
