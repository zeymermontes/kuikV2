-- Kuik — category tab (chip) colors
-- Colors for the sticky category tabs: selected background, unselected
-- background, and the tab font color. NULL = derive from the primary color.

alter table tenant_theme
  add column tab_selected_color   text,
  add column tab_unselected_color text,
  add column tab_font_color       text;
