import type { Metadata } from 'next';
import { requireReservations } from '@/lib/auth';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { TerminalModeButton } from '@/components/pos/TerminalModeButton';
import { ShellUpdateBanner } from '@/components/ShellUpdateBanner';
import { NewOrderAlert } from '@/components/orders/NewOrderAlert';
import { StaffAlerts } from '@/components/StaffAlerts';
import { ordersBoardEnabled } from '@/lib/orders/board';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Kuik — Anfitrión',
  manifest: '/host.webmanifest',
};

/** The host stand: a full-screen app for the door, like /pos is for the register. */
export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireReservations(); // auth + role gate
  const ordersBoard = await ordersBoardEnabled(ctx.tenant.id);
  return (
    <StaffIntlProvider>
      <div className="min-h-dvh">{children}</div>
      <TerminalModeButton />
      {ordersBoard && <NewOrderAlert tenantId={ctx.tenant.id} />}
      <StaffAlerts tenantId={ctx.tenant.id} role={ctx.role} />
      <ShellUpdateBanner appsUrl={`${SITE_URL}/apps`} />
    </StaffIntlProvider>
  );
}
