import { notFound } from 'next/navigation';
import { getTenantByHostKey, getProductsByIds } from '@/lib/tenant';
import { MenuScreen } from '@/components/menu/MenuScreen';
import { Landing } from '@/components/menu/Landing';
import { CustomLandingFrame } from '@/components/menu/CustomLandingFrame';

type Params = { tenant: string };

// Revalidate periodically; admin edits also trigger on-demand revalidation.
export const revalidate = 60;

export default async function TenantHome({
  params,
}: {
  params: Promise<Params>;
}) {
  const { tenant: hostKey } = await params;
  const key = decodeURIComponent(hostKey);
  const data = await getTenantByHostKey(key);
  if (!data) notFound();

  // Home-screen resolution (super-admin's landing_mode is authoritative):
  //   'custom' → the uploaded static site (sandboxed iframe).
  //   'none'   → straight to the menu.
  //   'builder'→ defer to the owner: their template landing if enabled, else menu.
  const { landing } = data;

  // Custom site: render in a sandboxed iframe via the /api/landing proxy
  // (Supabase won't serve HTML as text/html). No allow-same-origin, so the
  // tenant's JS runs in an opaque origin and can't touch our session, cookies,
  // or ordering APIs.
  if (landing.landing_mode === 'custom' && landing.custom_entry) {
    return <CustomLandingFrame tenant={data.tenant} entryPath={landing.custom_entry} />;
  }

  // Template landing as the home screen (unless the super-admin forced 'none').
  if (landing.landing_mode !== 'none' && landing.enabled) {
    const featured = await getProductsByIds(
      data.tenant.id,
      landing.featured_product_ids,
    );
    return (
      <Landing
        tenant={data.tenant}
        theme={data.theme}
        contact={data.contact}
        ordering={data.ordering}
        landing={landing}
        featured={featured}
      />
    );
  }

  return <MenuScreen hostKey={key} />;
}
