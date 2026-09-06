// What search engines read about a page: descriptions, canonical URLs and
// schema.org JSON-LD. Pure functions, shared by the marketing site and every
// restaurant's public menu, and unit-tested in tests/seo.test.ts.
//
// Two audiences, two goals:
//   - kuik.mx must rank for its own name and for what it sells ("menú digital",
//     "punto de venta para restaurante"), so it declares itself as an
//     Organization selling a SoftwareApplication and marks its FAQ up.
//   - A restaurant's site must rank for the restaurant's name, so each one is
//     a schema.org Restaurant with its address, hours, links and full menu.
//     Every one of them also links back to kuik.mx (the "Hecho con Kuik"
//     footer), which is what tells Google the platform is real.

import { PROTOCOL, ROOT_DOMAIN, tenantBaseUrl } from '@/lib/config';
import { DAY_KEYS, parseWeekHours } from '@/lib/hours';
import type { FullTenant, MenuCategory, Product } from '@/lib/database.types';

export const SITE_URL = `${PROTOCOL}://${ROOT_DOMAIN}`;
export const SITE_NAME = 'Kuik';

type Json = Record<string, unknown>;

/** Drop null/undefined/empty values so the JSON-LD stays tidy. */
function compact<T extends Json>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)),
  ) as T;
}

/** Cut at a word boundary so a meta description never ends mid-word. */
export function clampText(s: string, max = 158): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[,;:.]+$/, '')}…`;
}

// ── Marketing site ──────────────────────────────────────────────────────────

export function organizationJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/icons/icon-512.png`,
    description: 'Menú digital, pedidos por WhatsApp, punto de venta, pantalla de cocina y reservaciones para restaurantes en México.',
    areaServed: 'MX',
    contactPoint: { '@type': 'ContactPoint', contactType: 'sales', availableLanguage: ['es', 'en'] },
  };
}

export function websiteJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: 'es-MX',
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export interface PlanOffer {
  name: string;
  amount: number;
  currency: string;
}

/** Kuik as a product, with its plans as offers (what puts prices in the search result). */
export function softwareJsonLd(offers: PlanOffer[]): Json {
  const prices = offers.map((o) => o.amount);
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': `${SITE_URL}/#software`,
    name: SITE_NAME,
    url: SITE_URL,
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Restaurant POS',
    operatingSystem: 'Web, iOS, Android, Windows, macOS',
    inLanguage: ['es', 'en'],
    description:
      'Menú digital con pedidos por WhatsApp y pago con tarjeta, punto de venta con pantalla de cocina e impresión automática, y reservaciones con puesto de anfitrión.',
    screenshot: `${SITE_URL}/og.png`,
    publisher: { '@id': `${SITE_URL}/#organization` },
    offers: compact({
      '@type': 'AggregateOffer',
      priceCurrency: offers[0]?.currency ?? 'MXN',
      lowPrice: prices.length ? Math.min(...prices) : undefined,
      highPrice: prices.length ? Math.max(...prices) : undefined,
      offerCount: offers.length,
      offers: offers.map((o) => ({
        '@type': 'Offer',
        name: o.name,
        price: o.amount,
        priceCurrency: o.currency,
        priceSpecification: {
          '@type': 'UnitPriceSpecification',
          price: o.amount,
          priceCurrency: o.currency,
          unitText: 'MONTH',
        },
      })),
    }),
  };
}

export function faqJsonLd(items: { q: string; a: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.name,
      item: `${SITE_URL}${b.path}`,
    })),
  };
}

// ── Restaurant sites ────────────────────────────────────────────────────────

const DAY_NAMES: Record<(typeof DAY_KEYS)[number], string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

/** schema.org OpeningHoursSpecification from the stored week; days with identical hours are merged. */
export function openingHoursJsonLd(hours: unknown): Json[] {
  const week = parseWeekHours(hours);
  if (!week) return [];
  const groups = new Map<string, string[]>();
  week.forEach((d, i) => {
    if (d.closed) return;
    const key = `${d.open}-${d.close}`;
    groups.set(key, [...(groups.get(key) ?? []), DAY_NAMES[DAY_KEYS[i]]]);
  });
  return Array.from(groups.entries()).map(([key, days]) => {
    const [opens, closes] = key.split('-');
    return { '@type': 'OpeningHoursSpecification', dayOfWeek: days, opens, closes };
  });
}

/** E.164-ish telephone from a stored WhatsApp number; null when it is not a usable number. */
export function telephoneFor(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

export function instagramUrl(handle: string | null | undefined): string | null {
  if (!handle) return null;
  if (/^https?:\/\//i.test(handle)) return handle;
  return `https://instagram.com/${handle.replace(/^@/, '')}`;
}

/** The restaurant's canonical origin: its own domain when it has one, else its kuik.mx subdomain. */
export function tenantOrigin(t: FullTenant): string {
  return tenantBaseUrl(t.tenant.subdomain, t.tenant.custom_domain_status === 'verified' ? t.tenant.custom_domain : null);
}

/** Whether "/" shows a landing (so the menu is its own page at /menu) or the menu itself. */
export function hasLandingHome(t: FullTenant): boolean {
  const l = t.landing;
  if (l.landing_mode === 'none') return false;
  if (l.landing_mode === 'custom') return Boolean(l.custom_entry) || l.enabled;
  return l.enabled;
}

/** The one URL search engines should list for the menu: /menu behind a landing, else the home page. */
export function menuCanonicalPath(t: FullTenant): string {
  return hasLandingHome(t) ? '/menu' : '/';
}

/** The meta description of a restaurant's site: what it is, where, and how to order. */
export function tenantDescription(t: FullTenant, locale: string): string {
  const es = locale !== 'en';
  const parts: string[] = [];
  const tag = t.landing.tagline || t.theme.slogan;
  parts.push(es ? `Menú de ${t.tenant.name}` : `${t.tenant.name} menu`);
  if (tag) parts.push(tag);
  if (t.contact.address) parts.push(t.contact.address);
  const can: string[] = [];
  if (t.ordering.ordering_enabled && t.contact.whatsapp_phone) can.push(es ? 'pide por WhatsApp' : 'order on WhatsApp');
  if (t.contact.reservations_enabled) can.push(es ? 'reserva en línea' : 'book a table online');
  if (can.length) {
    const s = can.join(es ? ' o ' : ' or ');
    parts.push(es ? `Ve precios y fotos, ${s}.` : `See prices and photos, ${s}.`);
  } else {
    parts.push(es ? 'Precios y fotos actualizados.' : 'Up-to-date prices and photos.');
  }
  return clampText(parts.join('. ').replace(/\.\./g, '.'));
}

const MAX_MENU_ITEMS = 150;

/** The restaurant as schema.org sees it, menu included when given. */
export function restaurantJsonLd(t: FullTenant, menu: MenuCategory[] | null, currency: string): Json {
  const origin = tenantOrigin(t);
  const { tenant, theme, contact, landing } = t;
  const images = [theme.cover_image_url, theme.logo_url].filter((u): u is string => Boolean(u));
  const sameAs = [instagramUrl(contact.instagram), contact.facebook, contact.website].filter((u): u is string => Boolean(u));

  let budget = MAX_MENU_ITEMS;
  const menuItem = (p: Product): Json =>
    compact({
      '@type': 'MenuItem',
      name: p.name,
      description: p.description || undefined,
      image: p.image_url || undefined,
      offers:
        p.price != null && p.show_price && theme.show_prices
          ? { '@type': 'Offer', price: p.price, priceCurrency: currency, availability: p.is_available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' }
          : undefined,
    });
  const section = (c: MenuCategory): Json => {
    const items: Json[] = [];
    for (const e of c.entries) {
      if (e.kind !== 'product' || budget <= 0) continue;
      budget--;
      items.push(menuItem(e));
    }
    return compact({
      '@type': 'MenuSection',
      name: c.name,
      image: c.banner_image_url || undefined,
      hasMenuItem: items,
      hasMenuSection: c.subcategories.map(section).filter((s) => (s.hasMenuItem as unknown[] | undefined)?.length),
    });
  };

  return compact({
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    '@id': `${origin}/#restaurant`,
    name: tenant.name,
    url: origin,
    image: images,
    logo: theme.logo_url || undefined,
    description: landing.tagline || theme.slogan || undefined,
    telephone: telephoneFor(contact.whatsapp_phone),
    email: contact.email || undefined,
    address: contact.address
      ? { '@type': 'PostalAddress', streetAddress: contact.address, addressCountry: (tenant.country_iso || 'MX').toUpperCase() }
      : undefined,
    hasMap: contact.maps_url || undefined,
    openingHoursSpecification: openingHoursJsonLd(contact.hours),
    sameAs,
    acceptsReservations: contact.reservations_enabled ? 'True' : undefined,
    currenciesAccepted: currency,
    hasMenu: menu
      ? compact({
          '@type': 'Menu',
          url: `${origin}/menu`,
          inLanguage: tenant.locale === 'en' ? 'en' : 'es',
          hasMenuSection: menu.map(section).filter((s) => (s.hasMenuItem as unknown[] | undefined)?.length || (s.hasMenuSection as unknown[] | undefined)?.length),
        })
      : `${origin}/menu`,
  });
}
