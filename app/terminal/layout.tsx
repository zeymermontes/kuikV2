import type { Metadata } from 'next';
import { requireTenant } from '@/lib/auth';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { ShellUpdateBanner } from '@/components/ShellUpdateBanner';
import { NewOrderAlert } from '@/components/orders/NewOrderAlert';
import { StaffAlerts } from '@/components/StaffAlerts';
import { ordersBoardConfig } from '@/lib/orders/board';
import { PwaProvider } from '@/components/dashboard/PwaProvider';
import { ShellBackButton } from '@/components/pos/ShellBackButton';
import { fcmConfigured } from '@/lib/push/fcm';
import { apnsConfigured } from '@/lib/push/apns';
import { SITE_URL } from '@/lib/seo';
import { sectionsFor } from '@/lib/devices/access';

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
  const sections = await sectionsFor(ctx.user);
  const orders = await ordersBoardConfig(ctx.tenant.id);
  return (
    <StaffIntlProvider>
      {/* Push starts here for whoever never opens the dashboard: the phone app
          registers by itself, and a browser (a linked computer) gets the
          worker its "turn on alerts" switch on the hub needs. */}
      <PwaProvider nativePush={{ android: fcmConfigured(), ios: apnsConfigured() }}>
        <div className="min-h-dvh bg-[#111114] text-white">{children}</div>
      </PwaProvider>
      {/* Android back on the hub leaves the app; it never reopens a section. */}
      <ShellBackButton />
      {orders.board && <NewOrderAlert tenantId={ctx.tenant.id} enabled={orders.alerts.notifyHost || orders.alerts.notifyPos} />}
      <StaffAlerts tenantId={ctx.tenant.id} role={ctx.role} userId={ctx.user.id} sections={sections} />
      <ShellUpdateBanner appsUrl={`${SITE_URL}/apps`} />
    </StaffIntlProvider>
  );
}
