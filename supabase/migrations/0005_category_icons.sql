-- Kuik — per-category tab/chip icon or image
-- An emoji (icon) and/or a small image shown next to the category name in the
-- sticky tab nav and section headers.

alter table categories
  add column icon           text,   -- emoji, e.g. "🌮"
  add column icon_image_url text;    -- small square image for the tab/chip
