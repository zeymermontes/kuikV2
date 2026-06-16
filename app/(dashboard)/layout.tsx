import { requireTenant, getMemberships } from '@/lib/auth';
import { tenantUrl } from '@/lib/config';
import { canUseDevFeatures } from '@/lib/features';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { TrialBanner } from '@/components/dashboard/TrialBanner';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireTenant();
  const memberships = await getMemberships(ctx.user.id);

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
        <TrialBanner subscription={ctx.subscription} />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
