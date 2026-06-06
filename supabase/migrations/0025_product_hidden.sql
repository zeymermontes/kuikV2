-- Kuik — per-product visibility
-- A hidden product is kept in the admin but never rendered on the public menu
-- (distinct from `is_available`, which shows it as sold out).

alter table products
  add column is_hidden boolean not null default false;
