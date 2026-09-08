-- Kuik — the order board is a per-restaurant feature, and orders can be rejected or edited
--
-- A restaurant that only takes orders on WhatsApp has no use for the Pedidos
-- board, and its orders are not logged at all (app/api/order). The super
-- admin turns the board on per tenant; with it on, WhatsApp orders are
-- stored, the board and the live alerts appear, and the apps' hub gets a tile.
alter table tenant_ordering add column if not exists orders_board boolean not null default false;

-- Rejected from the board, with the reason the guest is told. Edited orders
-- (a line out, a quantity changed) keep the time so the board can say so.
alter table orders add column if not exists reject_reason text;
alter table orders add column if not exists edited_at timestamptz;
