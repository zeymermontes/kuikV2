-- Kuik — Google Maps link
-- An explicit map URL for the location (falls back to a search by address).
-- Per tenant and per branch.

alter table tenant_contact add column maps_url text;
alter table branches      add column maps_url text;
