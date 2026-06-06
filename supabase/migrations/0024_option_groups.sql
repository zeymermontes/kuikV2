-- Kuik — dynamic per-product option groups (multiselects)
-- Each product can define its own option groups: name, description, required or
-- not, single or multiple choice, each option with an optional extra cost.
-- Replaces the fixed variants/modifiers/removables (kept for back-compat).

alter table products
  add column option_groups jsonb not null default '[]'::jsonb;
