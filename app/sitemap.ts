import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';
import { APP_SUBDOMAIN, ROOT_HOST } from '@/lib/config';
import { getTenantByHostKey } from '@/lib/tenant';
import { SITE_URL, hasLandingHome } from '@/lib/seo';
import { FEATURE_PAGES } from '@/lib/landing/features';

// Host-aware like robots.ts: kuik.mx lists the marketing pages, a restaurant's
// host lists its own public pages under its canonical origin (custom domain
// when verified), and the dashboard host lists nothing.

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const host = ((await headers()).get('host') ?? '').split(':')[0].toLowerCase();
  const isRoot = host === ROOT_HOST || host === `www.${ROOT_HOST}` || host === '';
  const isApp = host === `${APP_SUBDOMAIN}.${ROOT_HOST}`;

  if (isApp) return [];
  if (isRoot) {
    return [
      { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1 },
      ...FEATURE_PAGES.map((f) => ({ url: `${SITE_URL}/${f.slug}`, changeFrequency: 'monthly' as const, priority: 0.8 })),
    ];
  }

  const key = host.endsWith(`.${ROOT_HOST}`) ? host.slice(0, -(ROOT_HOST.length + 1)) : host;
  const data = await getTenantByHostKey(key);
  if (!data?.tenant.is_published) return [];

  // The sitemap is served from whichever host was asked, but the URLs inside it
  // are the canonical ones: a verified custom domain, else the kuik.mx subdomain.
  const proto = host === 'localhost' || host.endsWith('.localhost') ? 'http' : 'https';
  const custom = data.tenant.custom_domain_status === 'verified' ? data.tenant.custom_domain : null;
  const origin = custom ? `https://${custom}` : `${proto}://${host}`;
  const updated = new Date(Math.max(new Date(data.tenant.updated_at).getTime(), new Date(data.theme.updated_at ?? 0).getTime() || 0));

  const out: MetadataRoute.Sitemap = [{ url: `${origin}/`, lastModified: updated, changeFrequency: 'weekly', priority: 1 }];
  if (hasLandingHome(data)) out.push({ url: `${origin}/menu`, lastModified: updated, changeFrequency: 'weekly', priority: 0.9 });
  for (const b of data.branches) {
    out.push({ url: `${origin}/b/${encodeURIComponent(b.slug)}`, lastModified: updated, changeFrequency: 'weekly', priority: 0.7 });
  }
  return out;
}
