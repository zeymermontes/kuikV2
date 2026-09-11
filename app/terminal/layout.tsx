import type { Metadata } from 'next';
import { requireTenant } from '@/lib/auth';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { ShellUpdateBanner } from '@/components/ShellUpdateBanner';
import { NewOrderAlert } from '@/components/orders/NewOrderAlert';
import { StaffAlerts } from '@/components/StaffAlerts';
import { ordersBoardEnabled } from '@/lib/orders/board';
import { NativePush } from '@/components/dashboard/NativePush';
import { fcmConfigured } from '@/lib/push/fcm';
import { apnsConfigured } from '@/lib/push/apns';
import { SITE_URL } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Kuik',
};

/**
 * Where the native apps (native/terminal, native/mobile) start on every
 * launch, and where they return after login: one login per device, then the
 * hub with everything this account can open — register, kitchen, host stand,
 * customer display, admin panel. In a browser it is just a launcher for the
 * same pages.
 */
export default async function TerminalLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireTenant(); // auth gate: redirects to /login or /onboarding if needed
  const ordersBoard = await ordersBoardEnabled(ctx.tenant.id);
  return (
    <StaffIntlProvider>
      <div className="min-h-dvh bg-[#111114] text-white">{children}</div>
      {/* The phone app registers for push here, since it may never open the dashboard. */}
      <NativePush enabled={{ android: fcmConfigured(), ios: apnsConfigured() }} />
      {ordersBoard && <NewOrderAlert tenantId={ctx.tenant.id} />}
      <StaffAlerts tenantId={ctx.tenant.id} role={ctx.role} />
      <ShellUpdateBanner appsUrl={`${SITE_URL}/apps`} />
    </StaffIntlProvider>
  );
}
