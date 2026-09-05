-- Two checkout knobs the first payment pass left out.
--
-- 'onsite': the guest pays at the counter on pickup / when served — the common
-- case for a coffee bar that neither takes cards online nor wants a transfer.
-- Constraint rebuilt so the tenant can offer it (0060 named the column
-- inline, so its check got the default name).
alter table tenant_ordering
  drop constraint if exists tenant_ordering_payment_methods_check;
alter table tenant_ordering
  add constraint tenant_ordering_payment_methods_check
    check (payment_methods <@ array['cash', 'transfer', 'card', 'onsite']::text[]);

-- collect_name: whether the cart asks the guest's name. On by default so
-- nothing changes for existing restaurants; a counter that ticket-numbers
-- orders can switch it off.
alter table tenant_ordering
  add column if not exists collect_name boolean not null default true;
