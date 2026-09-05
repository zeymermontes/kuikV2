-- Payment method at checkout, opt-in per restaurant.
--
-- payment_methods: which of cash / transfer / card the cart offers. Empty
-- (the default) keeps today's behaviour: the cart never asks. When 'transfer'
-- is on and the transfer_* fields are filled, the cart shows them to the guest
-- and asks for a screenshot of the receipt over WhatsApp — the "¿Cómo ordenar?"
-- flow small shops already run by hand.
alter table tenant_ordering
  add column if not exists payment_methods text[] not null default '{}'
    check (payment_methods <@ array['cash', 'transfer', 'card']::text[]),
  add column if not exists transfer_bank text,
  add column if not exists transfer_holder text,
  add column if not exists transfer_account text,
  add column if not exists transfer_note text;

comment on column tenant_ordering.transfer_account is 'CLABE or account number shown to the guest when they pick transfer.';

-- What the guest said they would pay with, for the orders board.
alter table orders add column if not exists payment_method text;
