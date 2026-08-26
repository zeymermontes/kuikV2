import { MenuScreen } from '@/components/menu/MenuScreen';

type Params = { tenant: string };

export const revalidate = 60;

// The dedicated menu route (e.g. tacos.kuik.mx/menu), linked from the landing.
export default async function TenantMenuPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<{ reservar?: string }>;
}) {
  const { tenant: hostKey } = await params;
  // `?reservar=1` opens the booking sheet straight away, so a custom landing —
  // or a printed QR, or a Google listing — can link to it with a plain anchor.
  // Resolved on the server so the markup matches on hydration.
  const { reservar } = await searchParams;
  return (
    <MenuScreen hostKey={decodeURIComponent(hostKey)} openReservation={reservar === '1'} />
  );
}
