-- Kuik — removable ingredients per product
-- Free multi-select options to take something OUT of a dish (e.g. "Sin cebolla").
-- Extras (priced add-ons) already live in products.modifiers.

alter table products
  add column removables jsonb not null default '[]';  -- string[] e.g. ["Cebolla","Crema"]
