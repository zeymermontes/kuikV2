import type { Metadata } from 'next';
import { MenuScreen } from '@/components/menu/MenuScreen';
import { getTenantByHostKey } from '@/lib/tenant';
import { menuCanonicalPath } from '@/lib/seo';

type Params = { tenant: string };

export const revalidate = 60;

// With a landing on "/", the menu is its own page; without one, "/" already is
// the menu and this route is a copy of it, so the canonical points home.
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { tenant } = await params;
  const data = await getTenantByHostKey(decodeURIComponent(tenant));
  return { alternates: { canonical: data ? menuCanonicalPath(data) : '/menu' }, robots: { index: false, follow: true } };
}

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
