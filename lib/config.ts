// Central app configuration derived from env. Safe for both client and server
// (only NEXT_PUBLIC_* values are referenced here).

/** Root domain with no protocol, e.g. "kuik.mx" or "localhost:3000". */
export const ROOT_DOMAIN =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'localhost:3000';

/** Hostname portion of the root domain, without a port. */
export const ROOT_HOST = ROOT_DOMAIN.split(':')[0];

/** Subdomain reserved for the dashboard/admin (app.kuik.mx). */
export const APP_SUBDOMAIN = 'app';

export const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? `http://${ROOT_DOMAIN}`;

/** Protocol to use when building absolute tenant URLs. */
export const PROTOCOL = ROOT_HOST === 'localhost' ? 'http' : 'https';

/** Build the public URL for a tenant's menu from its subdomain. */
export function tenantUrl(subdomain: string): string {
  return `${PROTOCOL}://${subdomain}.${ROOT_DOMAIN}`;
}

export const SUPPORTED_LOCALES = ['es', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'es';

/** Curated fonts offered in the theme customizer (must match next/font setup). */
export const MENU_FONTS = [
  'Inter',
  'Poppins',
  'Playfair Display',
  'Lora',
  'Montserrat',
  'Roboto Slab',
] as const;
export type MenuFont = (typeof MENU_FONTS)[number];

/** Subdomains that may never be claimed by a tenant. */
export const RESERVED_SUBDOMAINS = new Set([
  'app', 'www', 'api', 'admin', 'dashboard', 'auth', 'login',
  'mail', 'cdn', 'static', 'assets', 'support', 'help', 'blog', 'kuik',
]);
