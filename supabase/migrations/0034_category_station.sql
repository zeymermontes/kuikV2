-- Kuik — kitchen station per category (for KDS routing)
-- When items are fired, one kitchen ticket is created per station. NULL falls
-- back to the category name.

alter table categories
  add column station text;
