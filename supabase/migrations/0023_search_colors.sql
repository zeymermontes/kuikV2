-- Kuik — search bar colors
-- Background, text and border color for the menu search box. NULL = derive from
-- the surface / text / border colors.

alter table tenant_theme
  add column search_bg_color     text,
  add column search_text_color   text,
  add column search_border_color text;
