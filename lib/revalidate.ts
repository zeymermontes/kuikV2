import 'server-only';
import { revalidatePath } from 'next/cache';
import { PROTOCOL, ROOT_DOMAIN } from '@/lib/config';

/**
 * Bust every cached page a tenant serves to the public.
 *
 * `revalidatePath` matches ONE path, and a menu lives at several: the landing
 * at `/s/<sub>`, the menu itself at `/s/<sub>/menu`, plus the QR and branch
 * views. Revalidating only the root — which is what every action did — left the
 * menu serving stale settings until its own ISR window expired, so a change
 * saved in the dashboard appeared not to take.
 *
 * A tenant on a custom domain is served under a SECOND host key: the proxy
 * rewrites pizza.com to /s/pizza.com/..., a different cache entry from
 * /s/<sub>/... — so pass `custom_domain` too or edits look stale for up to a
 * minute on the domain diners actually use.
 */
export function revalidateTenant(subdomain: string, customDomain?: string | null): void {
  for (const key of customDomain ? [subdomain, customDomain] : [subdomain]) {
    revalidatePath(`/s/${key}`);
    revalidatePath(`/s/${key}/menu`);
    revalidatePath(`/s/${key}/landing`);
    revalidatePath(`/s/${key}/qr`);
    // Branch pages are dynamic under /b/[branch]; 'page' covers every one.
    revalidatePath(`/s/${key}/b/[branch]`, 'page');
  }
  void purgeEdge(subdomain, customDomain);
}

/**
 * Cloudflare keeps its own copy of these pages for a minute (s-maxage), so a
 * change the server already has can still come back stale from the edge.
 * With an API token that may purge the zone, drop those copies too; without
 * one this is a no-op and the edge catches up within the minute.
 */
async function purgeEdge(subdomain: string, customDomain?: string | null): Promise<void> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zone = process.env.CLOUDFLARE_ZONE_ID;
  if (!token || !zone) return;
  const hosts = [`${subdomain}.${ROOT_DOMAIN}`, ...(customDomain ? [customDomain] : [])];
  const files = hosts.flatMap((h) => ['/', '/menu', '/landing', '/qr'].map((p) => `${PROTOCOL}://${h}${p}`));
  try {
    await fetch(`https://api.cloudflare.com/client/v4/zones/${zone}/purge_cache`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ files }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // The edge will expire on its own; the origin is already fresh.
  }
}
