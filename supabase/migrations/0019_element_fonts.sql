-- Kuik — per-element fonts
-- Optional separate fonts for category titles, product names, prices and
-- descriptions. NULL on any of these = inherit the main menu font.

alter table tenant_theme
  add column font_category    text,
  add column font_product     text,
  add column font_price       text,
  add column font_description  text;
