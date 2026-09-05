-- The hint inside the "notes" box on each product and cart line.
--
-- "Sin cebolla, extra salsa…" reads wrong on a matcha bar; the restaurant
-- can now write one that fits what it sells. Null keeps the built-in text.
alter table tenant_ordering add column if not exists note_placeholder text;
