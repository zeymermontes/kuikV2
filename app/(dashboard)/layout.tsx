import { requireTenant } from '@/lib/auth';
import { tenantUrl } from '@/lib/config';
import { Sidebar } from '@/components/dashboard/Sidebar';
import { TrialBanner } from '@/components/dashboard/TrialBanner';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireTenant();

  return (
    <div className="flex min-h-screen bg-neutral-50">
      <Sidebar
        isSuperAdmin={ctx.user.profile.role === 'super_admin'}
        menuUrl={tenantUrl(ctx.tenant.subdomain)}
        locale={ctx.user.profile.locale}
      />
      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <TrialBanner subscription={ctx.subscription} />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
