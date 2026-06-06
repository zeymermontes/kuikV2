-- Kuik — per-branch opening hours
-- Each branch can set its own weekly schedule (falls back to the main hours in
-- tenant_contact.hours when null).

alter table branches
  add column hours jsonb;
