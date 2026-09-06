import type { TenantTheme } from '@/lib/database.types';

// The public demo restaurant behind /demo/* and the live frames on the landing.
//
// It is not a row anywhere: the POS, kitchen and host screens already run in
// memory when `demo` is on (a throwaway local store, sample tickets, a sample
// floor), so a fixed id and a theme are all they need. Nothing written in a
// demo ever reaches the database.

export const DEMO_TENANT_ID = '00000000-0000-4000-8000-00000000d310';

export const DEMO_TENANT = {
  id: DEMO_TENANT_ID,
  name: 'Café Kuik',
  slogan: 'Demo en vivo',
  currency: 'MXN',
  timezone: 'America/Mexico_City',
} as const;

const now = '2026-01-01T00:00:00.000Z';

/** A complete theme row, so the same helpers that paint a real tenant paint the demo. */
export const DEMO_THEME: TenantTheme = {
  tenant_id: DEMO_TENANT_ID,
  primary_color: '#3b2a24',
  secondary_color: '#f59e0b',
  background_color: '#ffffff',
  text_color: '#171717',
  text_secondary_color: '#737373',
  card_color: '#ffffff',
  border_color: '#e5e5e5',
  separator_color: '#e5e5e5',
  tab_bar_color: null,
  tab_selected_color: null,
  tab_unselected_color: null,
  tab_font_color: null,
  button_color: '#f59e0b',
  button_text_color: '#111111',
  search_bg_color: null,
  search_text_color: null,
  search_border_color: null,
  font_family: 'Inter',
  custom_font_url: null,
  custom_font_name: null,
  font_category: null,
  font_product: null,
  font_price: null,
  font_description: null,
  logo_wide_url: null,
  favicon_url: null,
  logo_dark_url: null,
  logo_wide_dark_url: null,
  favicon_dark_url: null,
  cover_image_dark_url: null,
  background_image_url: null,
  background_music_url: null,
  background_music_volume: 0,
  cover_image_url: null,
  slogan: DEMO_TENANT.slogan,
  logo_url: null,
  show_prices: true,
  menu_mode: 'builder',
  menu_pdf_url: null,
  settings: {},
  updated_at: now,
};
