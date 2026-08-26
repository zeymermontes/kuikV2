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
 */
export function revalidateTenant(subdomain: string): void {
  revalidatePath(`/s/${subdomain}`);
  revalidatePath(`/s/${subdomain}/menu`);
  revalidatePath(`/s/${subdomain}/landing`);
  revalidatePath(`/s/${subdomain}/qr`);
  // Branch pages are dynamic under /b/[branch]; 'page' covers every one.
  revalidatePath(`/s/${subdomain}/b/[branch]`, 'page');
}
