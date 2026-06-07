-- Kuik — per-product cost
-- Cost of goods for a product, used to compute margin and profit in reports.

alter table products
  add column cost numeric(10,2);
