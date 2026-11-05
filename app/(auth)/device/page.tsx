import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getMembership, loadUser } from '@/lib/auth';
import { HUB_PATH } from '@/lib/native/back';
import { cleanCode, isCode } from '@/lib/devices/code';
import { DeviceLinkForm } from '@/components/auth/DeviceLinkForm';

export const metadata: Metadata = { title: 'Kuik' };
export const dynamic = 'force-dynamic';

/**
 * Where a shared device joins a restaurant: a tablet, a register or a kitchen
 * screen types the code its owner generated (Equipo → Dispositivos) and is
 * in, with no account. The QR next to that code opens this page with the
 * code filled in.
 *
 * A device that is already linked has nothing to type: it goes straight to
 * its hub. Two cases still get the form. A code in the address means the
 * owner is linking this device again, so the code wins. And a device whose
 * restaurant is gone is sent HERE by the hub (lib/auth.ts): sending it back
 * would loop.
 */
export default async function DevicePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const given = cleanCode(typeof code === 'string' ? code : '');
  const user = await loadUser();
  if (user?.isDevice && !isCode(given) && (await getMembership(user.id))) redirect(HUB_PATH);
  return (
    <DeviceLinkForm
      initialCode={isCode(given) ? given : ''}
      // Linking replaces whoever is signed in on this browser; say so first.
      current={user ? { name: user.profile.full_name || user.email || '', isDevice: user.isDevice } : null}
    />
  );
}
