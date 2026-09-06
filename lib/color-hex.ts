// Hex colour helpers shared by the design editors (theme colours carry an
// optional alpha as #rrggbbaa).

// Accept 3/4/6/8-digit hex (the 4/8 forms carry alpha).
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function normHex(v: string): string | null {
  let s = v.trim();
  if (s && !s.startsWith('#')) s = `#${s}`;
  return HEX.test(s) ? s : null;
}

/** Split a hex color into its solid #rrggbb part and an alpha 0–255. */
export function parseColor(hex: string): { rgb: string; alpha: number } {
  const m = /^#([0-9a-fA-F]+)$/.exec((hex ?? '').trim());
  let h = m?.[1] ?? '';
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (h.length === 6) return { rgb: `#${h}`, alpha: 255 };
  if (h.length === 8) return { rgb: `#${h.slice(0, 6)}`, alpha: parseInt(h.slice(6, 8), 16) };
  return { rgb: '#000000', alpha: 255 };
}

/** Combine #rrggbb + alpha into #rrggbb or #rrggbbaa. */
export function toHex(rgb: string, alpha: number): string {
  if (alpha >= 255) return rgb;
  return `${rgb}${Math.round(alpha).toString(16).padStart(2, '0')}`;
}
