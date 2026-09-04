import { MenuScreen } from '@/components/menu/MenuScreen';

type Params = { tenant: string };

export const revalidate = 60;

// The dedicated menu route (e.g. tacos.kuik.mx/menu), linked from the landing.
//
// Deliberately does NOT read `searchParams`: doing so opts the route out of
// prerendering, and this is the highest-traffic public page in the product.
// `?reservar=1` is handled client-side in MenuView, alongside `?mesa` and
// `?product` which already worked that way.
export default async function TenantMenuPage({ params }: { params: Promise<Params> }) {
  const { tenant: hostKey } = await params;
  return <MenuScreen hostKey={decodeURIComponent(hostKey)} />;
}
