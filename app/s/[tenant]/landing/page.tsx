import { notFound } from 'next/navigation';
import { getTenantByHostKey } from '@/lib/tenant';
import { CustomLandingFrame } from '@/components/menu/CustomLandingFrame';

type Params = { tenant: string };

// Revalidate periodically; admin edits also trigger on-demand revalidation.
export const revalidate = 60;

/**
 * Clean public URL for a tenant's custom landing, e.g. laseisdos.kuik.mx/landing.
 * Always renders the uploaded site when one exists — independent of the home
 * mode selector (which governs only what the QR/root shows). 404s if the
 * restaurant has no custom site uploaded.
 */
export default async function CustomLandingRoute({
  params,
}: {
  params: Promise<Params>;
}) {
  const { tenant: hostKey } = await params;
  const data = await getTenantByHostKey(decodeURIComponent(hostKey));
  if (!data?.landing.custom_entry) notFound();

  return <CustomLandingFrame tenant={data.tenant} entryPath={data.landing.custom_entry} />;
}
