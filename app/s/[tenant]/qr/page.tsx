import { MenuScreen } from '@/components/menu/MenuScreen';

type Params = { tenant: string };

export const revalidate = 60;

/**
 * The in-place menu — what a QR inside the restaurant points at
 * (e.g. tacos.kuik.mx/qr?mesa=4). Same menu as /menu, but it counts as the
 * "qr" channel, so the owner can turn the cart off here and leave it on for
 * links shared online (or the other way round).
 */
export default async function TenantQrMenuPage({ params }: { params: Promise<Params> }) {
  const { tenant: hostKey } = await params;
  return <MenuScreen hostKey={decodeURIComponent(hostKey)} channel="qr" />;
}
