-- Per-section colour schemes.
--
-- A category may carry its own accent (headings, prices, the add button, its
-- active tab) and its own background, so a matcha section can sit on sage
-- green while the coffee section stays cream — one menu, two moods. Both are
-- optional; null means "inherit the menu's theme", which is what every
-- existing category keeps doing.
alter table categories
  add column if not exists accent_color text,
  add column if not exists background_color text;

comment on column categories.accent_color is 'Hex colour for this section''s headings, prices, add button and active tab. Null = menu theme.';
comment on column categories.background_color is 'Hex colour behind this section''s items. Null = menu theme.';
