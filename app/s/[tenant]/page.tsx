import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantByHostKey, getProductsByIds, getMenu } from '@/lib/tenant';
import { RestaurantJsonLd } from '@/components/menu/RestaurantJsonLd';
import { MenuScreen } from '@/components/menu/MenuScreen';
import { Landing } from '@/components/menu/Landing';
import { CustomLandingFrame } from '@/components/menu/CustomLandingFrame';
import { createAdminClient } from '@/lib/supabase/admin';

type Params = { tenant: string };

// Revalidate periodically; admin edits also trigger on-demand revalidation.
export const revalidate = 60;

// The layout sets metadataBase to the restaurant's canonical origin.
export const metadata: Metadata = { alternates: { canonical: '/' } };

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
  //
  // Only when the entry file is really there: the iframe cannot tell a 404
  // from a page, so a site that went missing (the media sweep once deleted
  // every custom landing) showed a blank screen or "Not found" for weeks
  // instead of the menu. A missing file falls through to the next mode.
  if (landing.landing_mode === 'custom' && landing.custom_entry && (await customEntryExists(landing.custom_entry))) {
    return (
      <>
        <RestaurantJsonLd data={data} />
        <CustomLandingFrame tenant={data.tenant} entryPath={landing.custom_entry} contact={data.contact} />
      </>
    );
  }

  // Template landing as the home screen (unless the super-admin forced 'none').
  if (landing.landing_mode !== 'none' && landing.enabled) {
    const featured = await getProductsByIds(
      data.tenant.id,
      landing.featured_product_ids,
    );
    const menu = await getMenu(data.tenant.id);
    return (
      <>
        <RestaurantJsonLd data={data} menu={menu} />
        <Landing
        tenant={data.tenant}
        theme={data.theme}
        contact={data.contact}
        ordering={data.ordering}
        landing={landing}
        featured={featured}
        />
      </>
    );
  }

  return <MenuScreen hostKey={key} />;
}

/** Whether the uploaded site's entry file is in the media bucket. Cached with the page (ISR). */
async function customEntryExists(entryPath: string): Promise<boolean> {
  const slash = entryPath.lastIndexOf('/');
  if (slash < 0) return false;
  const dir = entryPath.slice(0, slash);
  const name = entryPath.slice(slash + 1);
  const { data, error } = await createAdminClient().storage.from('media').list(dir, { search: name, limit: 10 });
  // A storage hiccup should not hide a site that is there: only a clean
  // listing without the file counts as missing.
  if (error) return true;
  return (data ?? []).some((o) => o.name === name);
}
