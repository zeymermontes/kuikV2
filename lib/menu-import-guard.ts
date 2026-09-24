import { z } from 'zod';
import type { FullImportPayload } from '@/lib/menu-import';

/**
 * What an import file may contain before the server acts on it.
 *
 * The file is written by the owner (or by an AI on their behalf), so nothing
 * here is about trust between tenants — RLS covers that. It is about the
 * three ways a file can still hurt the tenant's own menu or the shared
 * server: a value that is not the type the menu expects (a `tags` object
 * makes the public page throw), a theme string that is really CSS (it lands
 * in a style attribute), and sheer size (every product is a DB round-trip
 * and every external photo a download).
 *
 * Runs in the browser and on the server alike: no node imports.
 */

export const IMPORT_LIMITS = {
  categories: 200,
  subcategoriesPerCategory: 100,
  productsPerCategory: 2000,
  productsTotal: 5000,
  optionGroupsPerProduct: 30,
  optionsPerGroup: 60,
  tagsPerProduct: 20,
} as const;

// A colour the theme layer can hand to CSS as-is: hex, rgb()/hsl() with
// plain numeric arguments, or a bare keyword. Nothing that can close the
// declaration (`;`), open a url() or name a font it should not.
const COLOR_RE = /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|hsl)a?\(\s*[\d.%,\s/]+\)|[a-z]{3,20})$/i;
// Google font names: letters, digits, spaces and dashes.
const FONT_RE = /^[a-z0-9][a-z0-9 _-]{0,59}$/i;

export function isCssColor(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 64 && COLOR_RE.test(v.trim());
}

export function isFontName(v: unknown): v is string {
  return typeof v === 'string' && FONT_RE.test(v.trim());
}

/**
 * Is this URL one of our own public media objects? Compared by origin and
 * path, not by prefix: `https://x.supabase.co@evil.com/` and
 * `https://x.supabase.co.evil.com/` both start with the project URL.
 */
export function isHostedMediaUrl(ref: string, supabaseUrl: string): boolean {
  if (!supabaseUrl) return false;
  try {
    const u = new URL(ref);
    const base = new URL(supabaseUrl);
    return (
      u.origin === base.origin &&
      u.username === '' &&
      u.password === '' &&
      u.pathname.startsWith('/storage/v1/object/public/media/')
    );
  } catch {
    return false;
  }
}

/** Loopback, private, link-local, CGNAT, multicast and reserved ranges, v4 and v6. */
export function isPrivateIp(ip: string): boolean {
  let s = ip.trim().toLowerCase();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  const v4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if ([a, b, Number(v4[3]), Number(v4[4])].some((n) => n > 255)) return true;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (!s.includes(':')) return true; // not an address at all
  // IPv4 mapped or translated (::ffff:a.b.c.d, 64:ff9b::a.b.c.d): judge the v4 part.
  const mapped = s.match(/^(?:::ffff:|64:ff9b::)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIp(mapped[1]);
  if (s.startsWith('::ffff:') || s.startsWith('64:ff9b:')) return true;
  const first = s.split(':')[0];
  return (
    s === '::' ||
    s === '::1' ||
    /^fc|^fd/.test(first) || // fc00::/7 unique local
    /^fe[89ab]/.test(first) || // fe80::/10 link-local
    /^fec/.test(first) || // fec0::/10 site-local
    /^ff/.test(first) // multicast
  );
}

/**
 * An http(s) URL worth fetching: no credentials, default or web ports, and a
 * host that is not an IP literal from a private range. Name resolution is the
 * server's job (it needs DNS); this is the cheap half.
 */
export function publicHttpUrl(ref: string): URL | null {
  let u: URL;
  try {
    u = new URL(ref);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== '80' && u.port !== '443') return null;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null;
  if (/^[\d.]+$/.test(host) || host.includes(':')) {
    if (isPrivateIp(host)) return null;
  }
  return u;
}

// ── Payload schema ────────────────────────────────────────────────────────

const short = (n: number) => z.string().max(n);
const text = (n: number) => z.string().max(n).nullable().optional();
const money = z.number().finite().nullable().optional().catch(null);
const flag = z.boolean().optional().catch(undefined);
const imageRef = z.string().max(2048).nullable().optional();
const colour = z
  .string()
  .max(64)
  .transform((v) => (isCssColor(v) ? v.trim() : undefined))
  .optional()
  .catch(undefined);

const option = z.object({
  name: short(200),
  price: z.number().finite().optional().catch(undefined),
});

const optionGroup = z.object({
  name: short(200),
  description: text(500),
  kind: z.enum(['dish', 'drink', 'takeaway']).optional().catch(undefined),
  required: flag,
  multiple: flag,
  options: z.array(option).max(IMPORT_LIMITS.optionsPerGroup).catch([]),
});

const product = z.object({
  name: short(200),
  description: text(2000),
  price: money,
  compareAtPrice: money,
  cost: money,
  available: flag,
  hidden: flag,
  tags: z.array(short(40)).max(IMPORT_LIMITS.tagsPerProduct).optional().catch(undefined),
  image: imageRef,
  optionGroups: z.array(optionGroup).max(IMPORT_LIMITS.optionGroupsPerProduct).optional().catch(undefined),
  variants: z.array(option).max(IMPORT_LIMITS.optionsPerGroup).optional().catch(undefined),
  modifiers: z.array(option).max(IMPORT_LIMITS.optionsPerGroup).optional().catch(undefined),
  removables: z.array(short(100)).max(IMPORT_LIMITS.optionsPerGroup).optional().catch(undefined),
  prepTime: text(50),
  calories: z.number().finite().nullable().optional().catch(null),
});

// A section's design is checked key by key in importCategoryTheme; here it
// only has to be an object of strings (or null, which clears the design).
const sectionTheme = z.record(z.string(), z.unknown()).nullable().optional();

const subcategory = z.object({
  name: short(200),
  icon: text(16),
  image: imageRef,
  color: text(64),
  background: text(64),
  theme: sectionTheme,
  products: z.array(product).max(IMPORT_LIMITS.productsPerCategory).optional(),
});

const category = subcategory.extend({
  subcategories: z.array(subcategory).max(IMPORT_LIMITS.subcategoriesPerCategory).optional(),
});

const design = z.object({
  primary_color: colour,
  secondary_color: colour,
  background_color: colour,
  text_color: colour,
  text_secondary_color: colour,
  card_color: colour,
  border_color: colour,
  separator_color: colour,
  button_color: colour,
  button_text_color: colour,
  tab_bar_color: colour,
  tab_selected_color: colour,
  tab_unselected_color: colour,
  tab_font_color: colour,
  font_family: z
    .string()
    .max(64)
    .transform((v) => (isFontName(v) ? v.trim() : undefined))
    .optional()
    .catch(undefined),
  slogan: z.string().max(200).optional().catch(undefined),
  background_image: imageRef,
});

const payloadSchema = z.object({
  design: design.optional(),
  ordering: z.object({ notePlaceholder: text(200) }).optional().catch(undefined),
  categories: z.array(category).max(IMPORT_LIMITS.categories),
});

/**
 * The payload as the server will act on it: unknown keys dropped, strings
 * bounded, bad theme values removed, wrong-typed optionals reset. Throws on
 * what cannot be repaired — a missing name, a non-array `categories`, or a
 * file over the size limits.
 */
export function sanitizeImportPayload(input: unknown): FullImportPayload {
  const r = payloadSchema.safeParse(input);
  if (!r.success) {
    const first = r.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.join('.')}` : '';
    throw new Error(`Invalid import file${where}: ${first?.message ?? 'unknown error'}`);
  }
  const p = r.data;
  // A dropped design value leaves an explicit undefined behind; the server
  // skips those, but the object is cleaner without them.
  if (p.design) {
    for (const k of Object.keys(p.design) as (keyof typeof p.design)[]) if (p.design[k] === undefined) delete p.design[k];
  }
  let products = 0;
  for (const c of p.categories) {
    products += c.products?.length ?? 0;
    for (const s of c.subcategories ?? []) products += s.products?.length ?? 0;
  }
  if (products > IMPORT_LIMITS.productsTotal) {
    throw new Error(`Invalid import file: ${products} products, the limit is ${IMPORT_LIMITS.productsTotal}`);
  }
  return p as FullImportPayload;
}
