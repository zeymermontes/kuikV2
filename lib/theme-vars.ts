import type { CSSProperties } from 'react';
import type { TenantTheme } from '@/lib/database.types';
import { SHEET_RADIUS, type MenuSettings } from '@/lib/menu-settings';

/**
 * The tenant theme as CSS variables. The public layout puts them on
 * `.kuik-root`; the dashboard's live preview re-applies them inside the
 * menu iframe as the owner edits, so both must derive them from one place.
 * Client-safe: no server imports.
 */

export const DARK = {
  bg: '#111114',
  text: '#f5f5f5',
  textSecondary: 'rgba(245,245,245,0.6)',
  surface: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.12)',
};

/** Quote a font value, mapping the custom-font sentinel to its @font-face name. */
export function fontCss(value: string): string {
  return `'${value}'`; // both the sentinel and Google names are used verbatim as family
}
/** CSS value for a per-element font; falls back to the main menu font. */
export function elementFont(font: string | null): string {
  return font ? `${fontCss(font)}, var(--brand-font)` : 'var(--brand-font)';
}

export function themeVars(theme: TenantTheme, settings: MenuSettings): CSSProperties {
  const dark = settings.darkMode === 'on';
  return {
    '--brand-primary': theme.primary_color,
    '--brand-secondary': theme.secondary_color,
    '--brand-bg': dark ? DARK.bg : theme.background_color,
    '--brand-text': dark ? DARK.text : theme.text_color,
    '--brand-text-secondary': dark
      ? DARK.textSecondary
      : (theme.text_secondary_color ?? '#737373'),
    '--brand-surface': dark ? DARK.surface : (theme.card_color ?? '#ffffff'),
    '--brand-border': dark ? DARK.border : (theme.border_color ?? '#e5e5e5'),
    '--brand-separator': theme.separator_color ?? '#e5e5e5',
    '--brand-font': `${fontCss(theme.font_family)}, system-ui, sans-serif`,
    // Per-element fonts (fall back to the main font).
    '--font-category': elementFont(theme.font_category),
    '--font-product': elementFont(theme.font_product),
    '--font-price': elementFont(theme.font_price),
    '--font-description': elementFont(theme.font_description),
    // Per-element typography (bold / italic / size), base sizes in rem.
    '--fw-category': settings.categoryBold ? '700' : '400',
    '--fst-category': settings.categoryItalic ? 'italic' : 'normal',
    '--fs-category': `${1.25 * settings.categorySize}rem`,
    '--fs-subcategory': `${1.25 * settings.categorySize * settings.subcategorySize}rem`,
    '--fw-product': settings.productBold ? '700' : '400',
    '--fst-product': settings.productItalic ? 'italic' : 'normal',
    '--fs-product': `${1 * settings.productSize}rem`,
    '--fw-price': settings.priceBold ? '700' : '400',
    '--fst-price': settings.priceItalic ? 'italic' : 'normal',
    '--fs-price': `${1 * settings.priceSize}rem`,
    '--fw-description': settings.descriptionBold ? '700' : '400',
    '--fst-description': settings.descriptionItalic ? 'italic' : 'normal',
    '--fs-description': `${0.875 * settings.descriptionSize}rem`,
    // Category tab bar + colors (fall back to the primary color).
    // Section bar has its own color ("Barra de secciones"); when unset it uses a
    // neutral frosted default — independent of the page/card background colors.
    '--tab-bar-bg':
      theme.tab_bar_color ??
      `color-mix(in srgb, ${dark ? DARK.bg : '#ffffff'} 90%, transparent)`,
    '--tab-selected-bg': theme.tab_selected_color ?? theme.primary_color,
    '--tab-unselected-bg':
      theme.tab_unselected_color ??
      `color-mix(in srgb, ${theme.primary_color} 12%, transparent)`,
    '--tab-selected-text': theme.tab_font_color ?? '#ffffff',
    '--tab-unselected-text': theme.tab_font_color ?? theme.primary_color,
    // Buttons (fall back to the primary color / white text).
    '--brand-button': theme.button_color ?? theme.primary_color,
    '--brand-button-text': theme.button_text_color ?? '#ffffff',
    // Search bar (fall back to surface / text / border).
    '--search-bg': theme.search_bg_color ?? 'var(--brand-surface)',
    '--search-text': theme.search_text_color ?? 'var(--brand-text)',
    '--search-border': theme.search_border_color ?? 'var(--brand-border)',
    // Cart / product sheets follow the card radius (see SHEET_RADIUS).
    '--sheet-radius': SHEET_RADIUS[settings.cornerRadius],
  } as CSSProperties;
}
