-- Kuik — button colors
-- Background and text color for the "add to order" buttons. NULL = derive from
-- the primary color (white text).

alter table tenant_theme
  add column button_color      text,
  add column button_text_color text;
