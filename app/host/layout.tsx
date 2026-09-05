import type { Metadata } from 'next';
import { requireReservations } from '@/lib/auth';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';

export const metadata: Metadata = {
  title: 'Kuik — Anfitrión',
  manifest: '/host.webmanifest',
};

/** The host stand: a full-screen app for the door, like /pos is for the register. */
export default async function HostLayout({ children }: { children: React.ReactNode }) {
  await requireReservations(); // auth + role gate
  return (
    <StaffIntlProvider>
      <div className="min-h-dvh">{children}</div>
    </StaffIntlProvider>
  );
}
