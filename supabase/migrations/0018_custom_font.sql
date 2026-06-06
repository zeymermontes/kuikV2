-- Kuik — custom uploaded font
-- A restaurant can upload its own font file (woff2/woff/ttf/otf). When set, the
-- public menu uses it via @font-face instead of the preset Google font.

alter table tenant_theme
  add column custom_font_url  text,
  add column custom_font_name text;
