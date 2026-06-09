-- Kuik — which reservation fields are required
-- { phone, party, note } booleans. Name, date and time are always required.

alter table tenant_contact
  add column reservation_required jsonb;
