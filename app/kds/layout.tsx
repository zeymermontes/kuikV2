import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { requireTenant } from '@/lib/auth';
import { showDevFeatures } from '@/lib/features';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { TerminalModeButton } from '@/components/pos/TerminalModeButton';
import { ShellUpdateBanner } from '@/components/ShellUpdateBanner';
import { NewOrderAlert } from '@/components/orders/NewOrderAlert';
import { ordersBoardEnabled } from '@/lib/orders/board';
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
  const ordersBoard = await ordersBoardEnabled(ctx.tenant.id);
  // KDS is in development — super admin only.
  if (!showDevFeatures(ctx)) redirect('/menu');
  return (
    <StaffIntlProvider>
      <div className="min-h-dvh">{children}</div>
      <TerminalModeButton />
      {ordersBoard && <NewOrderAlert tenantId={ctx.tenant.id} />}
      <ShellUpdateBanner appsUrl={`${SITE_URL}/apps`} />
    </StaffIntlProvider>
  );
}
