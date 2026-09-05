import type { CSSProperties } from 'react';
import type { TenantTheme } from '@/lib/database.types';

// The terminal and the customer screen wear the business's colours, not ours.
// The menu theme's button colour (falling back to its primary) is the accent
// for every call to action; the sidebar and the customer screen's dark ground
// are tinted with the primary so the whole register reads as the brand.
// Exposed as CSS variables on the POS root and mapped to Tailwind tokens in
// globals.css (`bg-pos-accent`, `text-pos-accent-text`, …).

/** White or near-black, whichever reads better on `hex`. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const lum = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lum(n >> 16) + 0.7152 * lum((n >> 8) & 255) + 0.0722 * lum(n & 255);
  return L > 0.4 ? '#111111' : '#ffffff';
}

export function posThemeVars(theme: Pick<TenantTheme, 'primary_color' | 'button_color' | 'button_text_color'>): CSSProperties {
  const primary = theme.primary_color || '#4f46e5';
  const accent = theme.button_color || primary;
  return {
    '--pos-accent': accent,
    '--pos-accent-text': theme.button_text_color || readableOn(accent),
    '--pos-accent-hover': `color-mix(in srgb, ${accent} 88%, black)`,
    '--pos-accent-soft': `color-mix(in srgb, ${accent} 12%, white)`,
    '--pos-sidebar': `color-mix(in srgb, ${primary} 22%, #15151d)`,
    '--pos-dark': `color-mix(in srgb, ${primary} 14%, #0b0b10)`,
    '--pos-bg': `color-mix(in srgb, ${primary} 4%, #f4f4f7)`,
  } as CSSProperties;
}
