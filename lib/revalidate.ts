import 'server-only';
import { revalidatePath } from 'next/cache';

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
}
