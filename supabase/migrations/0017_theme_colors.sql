-- Kuik — more editable theme colors
-- Card surface, borders, separators and a secondary (muted) text color.

alter table tenant_theme
  add column card_color           text not null default '#ffffff',
  add column border_color         text not null default '#e5e5e5',
  add column separator_color      text not null default '#e5e5e5',
  add column text_secondary_color text not null default '#737373';
