-- Kuik — optional background music
-- An MP3 played (after the first interaction) on the public menu, at a
-- configurable volume (0–100).

alter table tenant_theme
  add column background_music_url    text,
  add column background_music_volume integer not null default 50;
