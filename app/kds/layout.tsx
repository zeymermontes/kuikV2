import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireTenant } from '@/lib/auth';
import { showDevFeatures } from '@/lib/features';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { ShellBackButton } from '@/components/pos/ShellBackButton';
import { ShellUpdateBanner } from '@/components/ShellUpdateBanner';
import { NewOrderAlert } from '@/components/orders/NewOrderAlert';
import { StaffAlerts } from '@/components/StaffAlerts';
import { ordersBoardConfig } from '@/lib/orders/board';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Kuik — Cocina (KDS)',
};

export default async function KdsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireTenant(); // auth gate
  const orders = await ordersBoardConfig(ctx.tenant.id);
  // KDS is in development — super admin only.
  if (!showDevFeatures(ctx)) redirect('/menu');
  return (
    <StaffIntlProvider>
      <div className="min-h-dvh">{children}</div>
      <ShellBackButton />
      {orders.board && <NewOrderAlert tenantId={ctx.tenant.id} enabled={orders.alerts.notifyPos} />}
      <StaffAlerts tenantId={ctx.tenant.id} role={ctx.role} />
      <ShellUpdateBanner appsUrl={`${SITE_URL}/apps`} />
    </StaffIntlProvider>
  );
}
