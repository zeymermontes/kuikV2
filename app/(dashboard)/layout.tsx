import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { requireTenant, getMemberships } from '@/lib/auth';
import { tenantUrl } from '@/lib/config';
import { showDevFeatures } from '@/lib/features';
import { effectivePlan } from '@/lib/plan';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { TrialBanner } from '@/components/dashboard/TrialBanner';
import { PwaProvider } from '@/components/dashboard/PwaProvider';
import { StaffIntlProvider } from '@/components/intl/StaffIntlProvider';
import { getPendingSummary } from './reservations/actions';
import { getHandoffCount } from './whatsapp/inbox/actions';
import type { MemberRole } from '@/lib/database.types';
import { exitSupport } from './admin/actions';

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
  const tAdmin = ctx.support ? await getTranslations('superAdmin') : null;

  return (
    <StaffIntlProvider>
      <PwaProvider>
        <div className="flex min-h-screen bg-neutral-50">
          <Sidebar
            isSuperAdmin={ctx.user.profile.role === 'super_admin'}
            showDevFeatures={showDevFeatures(ctx)}
            role={ctx.role}
            menuUrl={tenantUrl(ctx.tenant.subdomain)}
            locale={ctx.user.profile.locale}
            tenants={memberships.map((m) => ({
              id: m.tenant.id,
              name: m.tenant.name,
            }))}
            activeTenantId={ctx.tenant.id}
            plan={effectivePlan(ctx.subscription)}
            enforcePlan={ctx.support}
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
            <TrialBanner subscription={ctx.subscription} />
            <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
              {children}
            </main>
          </div>
        </div>
      </PwaProvider>
    </StaffIntlProvider>
  );
}
