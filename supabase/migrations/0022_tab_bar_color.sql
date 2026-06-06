-- Kuik — category section bar color
-- Background color of the sticky category-tabs bar. NULL = a translucent shade
-- of the page background (current default).

alter table tenant_theme
  add column tab_bar_color text;
