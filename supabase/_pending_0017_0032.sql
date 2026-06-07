-- Kuik — pending migrations 0017→0032 (combined, idempotent).
-- Paste into Supabase → SQL Editor → Run. Safe to re-run.


-- ===== 0017_theme_colors.sql =====
-- Kuik — more editable theme colors
-- Card surface, borders, separators and a secondary (muted) text color.

alter table tenant_theme
  add column if not exists card_color           text not null default '#ffffff',
  add column if not exists border_color         text not null default '#e5e5e5',
  add column if not exists separator_color      text not null default '#e5e5e5',
  add column if not exists text_secondary_color text not null default '#737373';


-- ===== 0018_custom_font.sql =====
-- Kuik — custom uploaded font
-- A restaurant can upload its own font file (woff2/woff/ttf/otf). When set, the
-- public menu uses it via @font-face instead of the preset Google font.

alter table tenant_theme
  add column if not exists custom_font_url  text,
  add column if not exists custom_font_name text;


-- ===== 0019_element_fonts.sql =====
-- Kuik — per-element fonts
-- Optional separate fonts for category titles, product names, prices and
-- descriptions. NULL on any of these = inherit the main menu font.

alter table tenant_theme
  add column if not exists font_category    text,
  add column if not exists font_product     text,
  add column if not exists font_price       text,
  add column if not exists font_description  text;


-- ===== 0020_tab_colors.sql =====
-- Kuik — category tab (chip) colors
-- Colors for the sticky category tabs: selected background, unselected
-- background, and the tab font color. NULL = derive from the primary color.

alter table tenant_theme
  add column if not exists tab_selected_color   text,
  add column if not exists tab_unselected_color text,
  add column if not exists tab_font_color       text;


-- ===== 0021_button_colors.sql =====
-- Kuik — button colors
-- Background and text color for the "add to order" buttons. NULL = derive from
-- the primary color (white text).

alter table tenant_theme
  add column if not exists button_color      text,
  add column if not exists button_text_color text;


-- ===== 0022_tab_bar_color.sql =====
-- Kuik — category section bar color
-- Background color of the sticky category-tabs bar. NULL = a translucent shade
-- of the page background (current default).

alter table tenant_theme
  add column if not exists tab_bar_color text;


-- ===== 0023_search_colors.sql =====
-- Kuik — search bar colors
-- Background, text and border color for the menu search box. NULL = derive from
-- the surface / text / border colors.

alter table tenant_theme
  add column if not exists search_bg_color     text,
  add column if not exists search_text_color   text,
  add column if not exists search_border_color text;


-- ===== 0024_option_groups.sql =====
-- Kuik — dynamic per-product option groups (multiselects)
-- Each product can define its own option groups: name, description, required or
-- not, single or multiple choice, each option with an optional extra cost.
-- Replaces the fixed variants/modifiers/removables (kept for back-compat).

alter table products
  add column if not exists option_groups jsonb not null default '[]'::jsonb;


-- ===== 0025_product_hidden.sql =====
-- Kuik — per-product visibility
-- A hidden product is kept in the admin but never rendered on the public menu
-- (distinct from `is_available`, which shows it as sold out).

alter table products
  add column if not exists is_hidden boolean not null default false;


-- ===== 0026_branch_hours.sql =====
-- Kuik — per-branch opening hours
-- Each branch can set its own weekly schedule (falls back to the main hours in
-- tenant_contact.hours when null).

alter table branches
  add column if not exists hours jsonb;


-- ===== 0027_maps_url.sql =====
-- Kuik — Google Maps link
-- An explicit map URL for the location (falls back to a search by address).
-- Per tenant and per branch.

alter table tenant_contact add column if not exists maps_url text;
alter table branches      add column if not exists maps_url text;


-- ===== 0028_background_music.sql =====
-- Kuik — optional background music
-- An MP3 played (after the first interaction) on the public menu, at a
-- configurable volume (0–100).

alter table tenant_theme
  add column if not exists background_music_url    text,
  add column if not exists background_music_volume integer not null default 50;


-- ===== 0029_product_cost.sql =====
-- Kuik — per-product cost
-- Cost of goods for a product, used to compute margin and profit in reports.

alter table products
  add column if not exists cost numeric(10,2);


-- ===== 0030_order_board.sql =====
-- Kuik — order board
-- Track incoming (WhatsApp) orders through a simple kitchen workflow:
-- new → preparing → ready → done. Plus service type and table for context.

alter table orders
  add column if not exists status       text not null default 'new',
  add column if not exists service_type text,
  add column if not exists table_label  text;

create index if not exists orders_status_idx on orders (tenant_id, status, created_at desc);

-- Staff (any member) can advance an order's status.
drop policy if exists orders_update on orders;
create policy orders_update on orders for update
  using (public.is_member(tenant_id) or public.is_super_admin())
  with check (public.is_member(tenant_id) or public.is_super_admin());


-- ===== 0031_orders_realtime.sql =====
-- Kuik — realtime for the order board
-- Stream order inserts/updates to the dashboard over websockets (no polling).
-- RLS still applies: subscribers only receive their tenant's rows.

alter table orders replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'orders'
  ) then
    alter publication supabase_realtime add table orders;
  end if;
end $$;


-- ===== 0032_reservations.sql =====
-- Kuik — table reservations
-- Diners request a reservation from the public menu; staff confirm/cancel it.

create table if not exists reservations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants on delete cascade,
  branch_id     uuid references branches on delete set null,
  customer_name text not null,
  phone         text,
  party_size    int  not null default 2,
  date          date not null,
  "time"        text not null,                 -- "HH:MM"
  note          text,
  status        text not null default 'pending', -- pending | confirmed | seated | cancelled
  created_at    timestamptz not null default now()
);
create index if not exists reservations_tenant_idx on reservations (tenant_id, date, "time");

alter table reservations enable row level security;

-- Members manage their tenant's reservations (read + update + cancel).
-- Public requests are inserted server-side with the service role (bypasses RLS).
drop policy if exists reservations_manage on reservations;
create policy reservations_manage on reservations for all
  using (public.is_member(tenant_id) or public.is_super_admin())
  with check (public.is_member(tenant_id) or public.is_super_admin());

-- Toggle: accept reservations from the public menu.
alter table tenant_contact
  add column if not exists reservations_enabled boolean not null default false;
