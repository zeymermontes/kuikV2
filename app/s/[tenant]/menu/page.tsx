import { MenuScreen } from '@/components/menu/MenuScreen';

type Params = { tenant: string };

export const revalidate = 60;

// The dedicated menu route (e.g. tacos.kuik.mx/menu), linked from the landing.
export default async function TenantMenuPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { tenant: hostKey } = await params;
  return <MenuScreen hostKey={decodeURIComponent(hostKey)} />;
}
