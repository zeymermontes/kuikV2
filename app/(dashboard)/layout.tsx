import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { HUB_PATH } from '@/lib/native/back';
import { sectionsFor } from '@/lib/devices/access';
import { getTranslations } from 'next-intl/server';
import { requireTenant, getMemberships } from '@/lib/auth';
import { tenantUrl } from '@/lib/config';
import { showDevFeatures } from '@/lib/features';
import { effectivePlan, effectiveAddons } from '@/lib/plan';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { TrialBanner } from '@/components/dashboard/TrialBanner';
import { PwaProvider } from '@/components/dashboard/PwaProvider';
import { StaffAlerts } from '@/components/StaffAlerts';
import { ShellUpdateBanner } from '@/components/ShellUpdateBanner';
import { ShellBackButton } from '@/components/pos/ShellBackButton';
import { FreshOnArrival } from '@/components/FreshOnArrival';
import { AdvisorNotice } from '@/components/dashboard/AdvisorNotice';
import { SITE_URL } from '@/lib/seo';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { getPendingSummary } from './reservations/actions';
import { getHandoffCount } from './whatsapp/inbox/actions';
import type { MemberRole } from '@/lib/database.types';
import { exitSupport, exitCustomerView } from './admin/actions';
import { invoicingVisible } from '@/lib/cfdi';
import { fcmConfigured } from '@/lib/push/fcm';
import { apnsConfigured } from '@/lib/push/apns';

/**
 * The dashboard is installable; the public menu and marketing site are not.
 * `start_url` is "/" because the post-login redirect already lands each role on
 * its own home.
 */
/** Mirrors requireReservations() in lib/auth.ts — keep the two in step. */
const RESERVATION_ROLES: MemberRole[] = [
  'owner',
  'manager',
  'cashier',
  'waiter',
  'host',
];

export const metadata: Metadata = {
  title: 'Kuik',
  manifest: '/app.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Kuik' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/apple-touch-icon.png' },
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireTenant();
  // What a shared device may open; null for a person. Decides which alerts
  // this screen shows and where their links go (lib/notify/landing.ts).
  const sections = await sectionsFor(ctx.user);

  // A shared device (0100) comes through here for one thing, the orders
  // board, which lives among these pages. It gets the page and a way back to
  // its hub, and none of the admin panel around it: no sidebar, no search,
  // no restaurant switcher, no billing banners.
  if (ctx.user.isDevice) {
    const tHub = await getTranslations('terminal');
    return (
      <StaffIntlProvider>
        <ShellUpdateBanner appsUrl={`${SITE_URL}/apps`} />
        <StaffAlerts tenantId={ctx.tenant.id} role={ctx.role} userId={ctx.user.id} sections={sections} />
        <ShellBackButton />
        <div className="flex min-h-screen flex-col bg-neutral-50">
          <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2">
            <Link href={HUB_PATH} prefetch={true} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
              <ArrowLeft className="h-4 w-4" /> {tHub('backToHub')}
            </Link>
            <span className="ml-auto truncate text-sm text-neutral-500">{ctx.tenant.name}</span>
          </header>
          <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
            <FreshOnArrival>{children}</FreshOnArrival>
          </main>
        </div>
      </StaffIntlProvider>
    );
  }

  const memberships = await getMemberships(ctx.user.id);

  // Server-rendered so the badge is right on first paint; the component then
  // keeps it live over the same realtime channel the board uses.
  //
  // Gated on the nav entry rather than wrapped in try/catch: getPendingSummary
  // guards itself with requireReservations(), and `redirect()` reports by
  // throwing — a catch here would swallow it and leave someone on a page they
  // were being sent away from. Every role can see reservations today, so this
  // is really insurance against that list being narrowed later.
  const canSeeReservations = RESERVATION_ROLES.includes(ctx.role);
  const canSeeWhatsapp = ctx.role === 'owner' || ctx.role === 'manager';
  const [pending, handoffs] = await Promise.all([
    canSeeReservations ? getPendingSummary() : Promise.resolve({ total: 0, days: [] }),
    canSeeWhatsapp ? getHandoffCount() : Promise.resolve({ total: 0 }),
  ]);
  const tAdmin = ctx.support || ctx.customerView ? await getTranslations('superAdmin') : null;

  return (
    <StaffIntlProvider>
      <PwaProvider nativePush={{ android: fcmConfigured(), ios: apnsConfigured() }}>
        <ShellUpdateBanner appsUrl={`${SITE_URL}/apps`} />
        <StaffAlerts tenantId={ctx.tenant.id} role={ctx.role} userId={ctx.user.id} sections={sections} />
        {/* Inside the native apps the dashboard is one tile of the hub; this is the way back. */}
        <ShellBackButton />
        <div className="flex min-h-screen bg-neutral-50">
          <Sidebar
            isSuperAdmin={ctx.user.profile.role === 'super_admin' && !ctx.customerView}
            showDevFeatures={showDevFeatures(ctx)}
            invoicing={invoicingVisible(ctx)}
            role={ctx.role}
            menuUrl={tenantUrl(ctx.tenant.subdomain)}
            locale={ctx.user.profile.locale}
            tenants={memberships.map((m) => ({
              id: m.tenant.id,
              name: m.tenant.name,
            }))}
            activeTenantId={ctx.tenant.id}
            plan={effectivePlan(ctx.subscription)}
            addons={effectiveAddons(ctx.subscription)}
            enforcePlan={ctx.support || ctx.customerView}
            pendingReservations={pending.total}
            pendingHandoffs={handoffs.total}
          />
          <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
            {ctx.support && tAdmin && (
              <div className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
                <span className="truncate">
                  {tAdmin('supportBanner', { name: ctx.tenant.name })}
                </span>
                <form action={exitSupport}>
                  <button className="shrink-0 rounded-md bg-black/20 px-3 py-1 hover:bg-black/30">
                    {tAdmin('exitSupport')}
                  </button>
                </form>
              </div>
            )}
            {ctx.customerView && tAdmin && (
              <div className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-violet-600 px-4 py-2 text-sm font-medium text-white">
                <span className="truncate">{tAdmin('customerViewBanner')}</span>
                <form action={exitCustomerView}>
                  <button className="shrink-0 rounded-md bg-black/20 px-3 py-1 hover:bg-black/30">{tAdmin('customerViewExit')}</button>
                </form>
              </div>
            )}
            <TrialBanner subscription={ctx.subscription} />
            {/* New accounts: a Kuik advisor builds the menu with them, free. */}
            <AdvisorNotice tenantId={ctx.tenant.id} restaurantName={ctx.tenant.name} createdAt={ctx.tenant.created_at} locale={ctx.tenant.locale} variant="popup" />
            {/* Forms read best at 4xl; a page that renders a canvas (the flow editor)
                marks itself data-full-bleed and takes the whole width. */}
            <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 has-[[data-full-bleed]]:max-w-none has-[[data-full-bleed]]:px-2 has-[[data-full-bleed]]:py-2 sm:px-6 sm:has-[[data-full-bleed]]:px-3">
              <FreshOnArrival>{children}</FreshOnArrival>
            </main>
          </div>
        </div>
      </PwaProvider>
    </StaffIntlProvider>
  );
}
