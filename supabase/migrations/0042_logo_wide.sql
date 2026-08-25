-- Kuik — horizontal logo
--
-- `logo_url` is the round mark: it sits above the restaurant name in the
-- stacked header and doubles as the menu's favicon, so it wants to be roughly
-- square. The bar header instead centres a wordmark between the "back" and
-- "reserve" buttons, which is a wide image. Keeping them apart lets a
-- restaurant upload both and use each where it belongs.

alter table tenant_theme
  add column logo_wide_url text;
