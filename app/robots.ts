import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { APP_SUBDOMAIN, ROOT_HOST } from '@/lib/config';
import { getTenantByHostKey } from '@/lib/tenant';
import { SITE_URL } from '@/lib/seo';

// One robots.txt for every host this app answers on. The proxy leaves dotted
// paths alone, so a restaurant's site asks for /robots.txt here directly and
// the host header says which site it is.
//
//   kuik.mx          the marketing site: index it, keep crawlers out of the
//                    dashboard, the demos and the auth screens.
//   app.kuik.mx      the dashboard; its "/" is a copy of the landing, so
//                    nothing here should be indexed (canonicals point at kuik.mx).
//   <restaurant>     the public menu: index the landing, the menu and the
//                    branches; not the in-house QR copy (canonical /menu) nor
//                    receipts. An unpublished restaurant is closed to crawlers.

const PRIVATE_ROOT_PATHS = [
  '/admin', '/billing', '/branches', '/contact', '/dashboard', '/design', '/domain', '/landing',
  '/loyalty', '/menu', '/ordering', '/orders', '/reports', '/reservations', '/staff', '/tutorial',
  '/whatsapp', '/pos', '/kds', '/host', '/onboarding', '/demo/', '/api/', '/login', '/signup',
];

export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const host = ((await headers()).get('host') ?? '').split(':')[0].toLowerCase();
  const isRoot = host === ROOT_HOST || host === `www.${ROOT_HOST}` || host === '';
  const isApp = host === `${APP_SUBDOMAIN}.${ROOT_HOST}`;

  if (isRoot) {
    return { rules: { userAgent: '*', allow: '/', disallow: PRIVATE_ROOT_PATHS }, sitemap: `${SITE_URL}/sitemap.xml` };
  }
  if (isApp) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  const key = host.endsWith(`.${ROOT_HOST}`) ? host.slice(0, -(ROOT_HOST.length + 1)) : host;
  const data = await getTenantByHostKey(key);
  if (!data?.tenant.is_published) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  const proto = host === 'localhost' || host.endsWith('.localhost') ? 'http' : 'https';
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/qr', '/recibo/', '/factura', '/api/'] },
    sitemap: `${proto}://${host}/sitemap.xml`,
  };
}
