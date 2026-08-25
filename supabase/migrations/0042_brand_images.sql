-- Kuik — separate brand images, each with a light and a dark version
--
-- `logo_url` was doing three jobs: the round mark above the restaurant name,
-- the wordmark in a bar header, and the browser tab icon. Those want different
-- files — a square mark, a wide one, and a tiny square that still reads at
-- 16px — so each gets its own column.
--
-- Each also gets a dark counterpart, because "dark" is not only about the
-- menu's dark mode: a bar header is navy even on a light menu, so it needs the
-- white wordmark while the tab icon stays the colour one. Which version goes
-- where is chosen per slot in tenant_theme.settings (…Variant: auto/light/dark).
--
-- Everything is nullable and falls back to `logo_url` / `cover_image_url`, so
-- existing menus render exactly as before.

-- `if not exists` because an earlier cut of this migration shipped only
-- logo_wide_url; re-running the full version must not trip over it.
alter table tenant_theme
  add column if not exists logo_wide_url        text,
  add column if not exists logo_dark_url        text,
  add column if not exists logo_wide_dark_url   text,
  add column if not exists favicon_url          text,
  add column if not exists favicon_dark_url     text,
  add column if not exists cover_image_dark_url text;
