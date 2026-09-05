import type { CSSProperties } from 'react';
import type { CategoryTheme } from '@/lib/database.types';

/**
 * A section's own design, applied on top of the menu theme.
 *
 * Two scopes: `categoryThemeVars` restyles everything INSIDE the section
 * (headings, cards, prices, fonts), while `categoryPageVars` is only the page
 * chrome — background, text, tab strip — which MenuView hands to whichever
 * section is in view so the whole page fades from one mood to the next.
 * Fallbacks mirror the tenant layout's, so setting only a primary colour
 * behaves the same at either level.
 */

export const CATEGORY_THEME_COLORS = [
  'primary_color',
  'secondary_color',
  'background_color',
  'text_color',
  'text_secondary_color',
  'card_color',
  'border_color',
  'separator_color',
  'button_color',
  'button_text_color',
  'tab_bar_color',
  'tab_selected_color',
  'tab_unselected_color',
  'tab_font_color',
] as const;

export const CATEGORY_THEME_FONTS = [
  'font_family',
  'font_category',
  'font_product',
  'font_price',
  'font_description',
] as const;

const quote = (f: string) => `'${f}'`;

export function categoryThemeVars(t: CategoryTheme | null | undefined): CSSProperties {
  if (!t) return {};
  const v: Record<string, string> = {};
  const p = t.primary_color;
  if (p) {
    v['--brand-primary'] = p;
    v['--brand-button'] = t.button_color ?? p;
    v['--tab-selected-bg'] = t.tab_selected_color ?? p;
    v['--tab-unselected-bg'] = t.tab_unselected_color ?? `color-mix(in srgb, ${p} 12%, transparent)`;
    v['--tab-unselected-text'] = t.tab_font_color ?? p;
  }
  if (t.secondary_color) v['--brand-secondary'] = t.secondary_color;
  if (t.background_color) v['--brand-bg'] = t.background_color;
  if (t.text_color) v['--brand-text'] = t.text_color;
  if (t.text_secondary_color) v['--brand-text-secondary'] = t.text_secondary_color;
  if (t.card_color) v['--brand-surface'] = t.card_color;
  if (t.border_color) v['--brand-border'] = t.border_color;
  if (t.separator_color) v['--brand-separator'] = t.separator_color;
  if (t.button_color) v['--brand-button'] = t.button_color;
  if (t.button_color || p) v['--brand-button-text'] = t.button_text_color ?? '#ffffff';
  if (t.tab_bar_color) v['--tab-bar-bg'] = t.tab_bar_color;
  if (t.tab_selected_color) v['--tab-selected-bg'] = t.tab_selected_color;
  if (t.tab_unselected_color) v['--tab-unselected-bg'] = t.tab_unselected_color;
  if (t.tab_font_color) {
    v['--tab-selected-text'] = t.tab_font_color;
    v['--tab-unselected-text'] = t.tab_font_color;
  }
  // A section family resets the per-element fonts too: "this section is set
  // in Lora" should not leave the tenant's Poppins product names behind.
  if (t.font_family) v['--brand-font'] = `${quote(t.font_family)}, system-ui, sans-serif`;
  for (const key of ['category', 'product', 'price', 'description'] as const) {
    const f = t[`font_${key}`];
    if (f) v[`--font-${key}`] = `${quote(f)}, var(--brand-font)`;
    else if (t.font_family) v[`--font-${key}`] = 'var(--brand-font)';
  }
  return v as CSSProperties;
}

/** Only the page chrome: what fades as the active section changes. */
export function categoryPageVars(t: CategoryTheme | null | undefined): CSSProperties {
  if (!t) return {};
  const v: Record<string, string> = {};
  if (t.background_color) v['--brand-bg'] = t.background_color;
  if (t.text_color) v['--brand-text'] = t.text_color;
  if (t.text_secondary_color) v['--brand-text-secondary'] = t.text_secondary_color;
  if (t.tab_bar_color) v['--tab-bar-bg'] = t.tab_bar_color;
  return v as CSSProperties;
}

/** Every Google font any section asks for, so MenuView can load them. */
export function categoryThemeFonts(themes: (CategoryTheme | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const t of themes) {
    if (!t) continue;
    for (const key of CATEGORY_THEME_FONTS) if (t[key]) out.add(t[key]!);
  }
  return [...out];
}

export function googleFontsHref(families: string[]): string {
  const params = families
    .map((f) => `family=${f.trim().replace(/ /g, '+')}:wght@400;500;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

/**
 * The import file's category design: a full `theme` object, or the two
 * shorthands (`color` = accent, `background`) — shorthands first, so a theme
 * key can still override them.
 */
export function importCategoryTheme(cat: {
  theme?: Partial<CategoryTheme> | null;
  color?: string | null;
  background?: string | null;
}): CategoryTheme | null {
  const t: Record<string, string> = {};
  if (cat.color) {
    t.primary_color = cat.color;
    t.secondary_color = cat.color;
    t.button_color = cat.color;
  }
  if (cat.background) t.background_color = cat.background;
  for (const [k, val] of Object.entries(cat.theme ?? {})) {
    if (typeof val === 'string' && val) t[k] = val;
  }
  // A bundled filename is resolved to a hosted URL by the importer afterwards.
  if (cat.theme?.background_image === null) delete t.background_image;
  return Object.keys(t).length ? (t as CategoryTheme) : null;
}
