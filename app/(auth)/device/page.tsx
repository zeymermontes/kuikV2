import type { Metadata } from 'next';
import { loadUser } from '@/lib/auth';
import { cleanCode, isCode } from '@/lib/devices/code';
import { DeviceLinkForm } from '@/components/auth/DeviceLinkForm';

export const metadata: Metadata = { title: 'Kuik' };
export const dynamic = 'force-dynamic';

/**
 * Where a shared device joins a restaurant: a tablet, a register or a kitchen
 * screen types the code its owner generated (Equipo → Dispositivos) and is
 * in, with no account. The QR next to that code opens this page with the
 * code filled in.
 */
export default async function DevicePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const given = cleanCode(typeof code === 'string' ? code : '');
  const user = await loadUser();
  return (
    <DeviceLinkForm
      initialCode={isCode(given) ? given : ''}
      // Linking replaces whoever is signed in on this browser; say so first.
      current={user ? { name: user.profile.full_name || user.email || '', isDevice: user.isDevice } : null}
    />
  );
}
