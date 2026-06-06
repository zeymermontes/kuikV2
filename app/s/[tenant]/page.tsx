import { notFound } from 'next/navigation';
import { getTenantByHostKey, getProductsByIds } from '@/lib/tenant';
import { MenuScreen } from '@/components/menu/MenuScreen';
import { Landing } from '@/components/menu/Landing';

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

  // Landing as the home screen; otherwise go straight to the menu.
  if (data.landing.enabled) {
    const featured = await getProductsByIds(
      data.tenant.id,
      data.landing.featured_product_ids,
    );
    return (
      <Landing
        tenant={data.tenant}
        theme={data.theme}
        contact={data.contact}
        ordering={data.ordering}
        landing={data.landing}
        featured={featured}
      />
    );
  }

  return <MenuScreen hostKey={key} />;
}
