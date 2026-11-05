import { requireSection } from '@/lib/devices/access';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireTenant } from '@/lib/auth';
import { showDevFeatures } from '@/lib/features';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { ShellBackButton } from '@/components/pos/ShellBackButton';
import { FreshOnArrival } from '@/components/FreshOnArrival';
import { ShellUpdateBanner } from '@/components/ShellUpdateBanner';
import { NewOrderAlert } from '@/components/orders/NewOrderAlert';
import { StaffAlerts } from '@/components/StaffAlerts';
import { ordersBoardConfig } from '@/lib/orders/board';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Kuik POS',
  manifest: '/pos.webmanifest',
};

export default async function PosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireTenant(); // auth gate: redirects to /login or /onboarding if needed
  const orders = await ordersBoardConfig(ctx.tenant.id);
  // POS is in development — super admin only.
  if (!showDevFeatures(ctx)) redirect('/menu');
  await requireSection(ctx.user, 'pos');
  return (
    <StaffIntlProvider>
      <div className="min-h-dvh">
        <FreshOnArrival>{children}</FreshOnArrival>
      </div>
      <ShellBackButton />
      {orders.board && <NewOrderAlert tenantId={ctx.tenant.id} enabled={orders.alerts.notifyPos} />}
      <StaffAlerts tenantId={ctx.tenant.id} role={ctx.role} userId={ctx.user.id} />
      <ShellUpdateBanner appsUrl={`${SITE_URL}/apps`} />
    </StaffIntlProvider>
  );
}
