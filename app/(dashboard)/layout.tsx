import { getTranslations } from 'next-intl/server';
import { requireTenant, getMemberships } from '@/lib/auth';
import { tenantUrl } from '@/lib/config';
import { canUseDevFeatures } from '@/lib/features';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { TrialBanner } from '@/components/dashboard/TrialBanner';
import { exitSupport } from './admin/actions';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireTenant();
  const memberships = await getMemberships(ctx.user.id);
  const tAdmin = ctx.support ? await getTranslations('superAdmin') : null;

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <Sidebar
        isSuperAdmin={ctx.user.profile.role === 'super_admin'}
        showDevFeatures={canUseDevFeatures(ctx.user.email)}
        role={ctx.role}
        menuUrl={tenantUrl(ctx.tenant.subdomain)}
        locale={ctx.user.profile.locale}
        tenants={memberships.map((m) => ({ id: m.tenant.id, name: m.tenant.name }))}
        activeTenantId={ctx.tenant.id}
      />
      <div className="flex min-w-0 flex-1 flex-col pt-14 md:pt-0">
        {ctx.support && tAdmin && (
          <div className="sticky top-0 z-20 flex items-center justify-between gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-white">
            <span className="truncate">{tAdmin('supportBanner', { name: ctx.tenant.name })}</span>
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
  );
}
