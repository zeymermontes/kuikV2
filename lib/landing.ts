// Helpers for custom (bring-your-own-HTML) landing pages.

import { tenantBaseUrl } from '@/lib/config';
import type { Tenant } from '@/lib/database.types';

/** Content-type by file extension, used by the uploader and the proxy route. */
export const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  xml: 'application/xml; charset=utf-8',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
};

export function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

/** Storage folder (under the public `media` bucket) holding a tenant's site. */
export const LANDING_DIR = 'landing-site';

/**
 * The iframe `src` for a tenant's custom landing.
 *
 * Points at our own proxy route (`/api/landing/<tenantId>/...`) rather than the
 * raw storage URL, because Supabase serves uploaded HTML as text/plain. The
 * proxy re-serves it as text/html. We add `?menu=`/`?home=` query params with
 * the tenant's own URLs so the sandboxed site (an opaque origin that can't read
 * its parent's location) can build working "view menu" links.
 *
 * Returns a host-relative URL so it resolves against whatever host embeds it
 * (the tenant's domain in production, the app host in preview).
 */
export function customLandingSrc(
  tenant: Pick<Tenant, 'id' | 'subdomain' | 'custom_domain'>,
  entryPath: string,
): string {
  const base = tenantBaseUrl(tenant.subdomain, tenant.custom_domain);
  const params = new URLSearchParams({ menu: `${base}/menu`, home: base });
  const prefix = `${tenant.id}/${LANDING_DIR}/`;
  const rel = entryPath.startsWith(prefix) ? entryPath.slice(prefix.length) : 'index.html';
  return `/api/landing/${tenant.id}/${rel}?${params.toString()}`;
}
