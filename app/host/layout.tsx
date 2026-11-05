import type { Metadata } from 'next';
import { requireReservations } from '@/lib/auth';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { ShellBackButton } from '@/components/pos/ShellBackButton';
import { FreshOnArrival } from '@/components/FreshOnArrival';
import { ShellUpdateBanner } from '@/components/ShellUpdateBanner';
import { NewOrderAlert } from '@/components/orders/NewOrderAlert';
import { StaffAlerts } from '@/components/StaffAlerts';
import { ordersBoardConfig } from '@/lib/orders/board';
import { SITE_URL } from '@/lib/seo';
import { requireSection, sectionsFor } from '@/lib/devices/access';

export const metadata: Metadata = {
  title: 'Kuik — Anfitrión',
  manifest: '/host.webmanifest',
};

/** The host stand: a full-screen app for the door, like /pos is for the register. */
export default async function HostLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireReservations(); // auth + role gate
  await requireSection(ctx.user, 'host');
  const sections = await sectionsFor(ctx.user);
  const orders = await ordersBoardConfig(ctx.tenant.id);
  return (
    <StaffIntlProvider>
      <div className="min-h-dvh">
        <FreshOnArrival>{children}</FreshOnArrival>
      </div>
      <ShellBackButton />
      {orders.board && <NewOrderAlert tenantId={ctx.tenant.id} enabled={orders.alerts.notifyHost} />}
      <StaffAlerts tenantId={ctx.tenant.id} role={ctx.role} userId={ctx.user.id} sections={sections} />
      <ShellUpdateBanner appsUrl={`${SITE_URL}/apps`} />
    </StaffIntlProvider>
  );
}
