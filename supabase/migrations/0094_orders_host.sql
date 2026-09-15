-- Orders at the host stand and per-method approval.
--   code: the short id printed in the guest's WhatsApp message, so the reply
--         thread can be tied back to the order.
--   service_kind: the machine key (pickup/delivery/dinein) next to the
--         localized label already stored in service_type.
--   whatsapp_conversation_id: the chat the order came through, once known.
--   order_approval: which payment methods / service types are accepted by
--         themselves and which wait for a person (lib/orders/approval.ts).
alter table orders
  add column if not exists code text,
  add column if not exists service_kind text check (service_kind in ('pickup', 'delivery', 'dinein')),
  add column if not exists whatsapp_conversation_id uuid references whatsapp_conversations(id) on delete set null;
create index if not exists orders_code_idx on orders (tenant_id, code) where code is not null;

alter table tenant_ordering
  add column if not exists order_approval jsonb not null default '{}'::jsonb;
