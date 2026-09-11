-- Meta (Facebook) Pixel ids: Kuik's own, fired on kuik.mx and the sign-up
-- flow, and each restaurant's, fired on its public menu site. Both optional.
-- Digits only; the app validates before writing.
alter table platform_settings add column if not exists meta_pixel_id text;
alter table tenants add column if not exists meta_pixel_id text;
