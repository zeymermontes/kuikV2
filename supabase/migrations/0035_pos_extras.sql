-- Kuik — POS extras: discounts, voids, guests, product SKU/barcode

alter table tabs
  add column discount    numeric(10,2) not null default 0,
  add column void_reason text,
  add column guests       int not null default 1;

alter table products
  add column sku text;
