import { getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getPlatformSettings } from '@/lib/platform';
import { tenantUrl } from '@/lib/config';
import { formatPrice } from '@/lib/utils';
import { Card } from '@/components/ui';
import { AwardMonthsButton } from '@/components/dashboard/AwardMonthsButton';
import { PricingSettings } from '@/components/dashboard/PricingSettings';
import { PlanSelect } from '@/components/dashboard/PlanSelect';
import type { SubscriptionStatus } from '@/lib/database.types';

interface Overview {
  tenant_id: string;
  name: string;
  subdomain: string;
  custom_domain: string | null;
  owner_email: string;
  status: SubscriptionStatus | null;
  plan: 'basic' | 'pro' | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  free_months_granted: number | null;
  created_at: string;
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trialing: 'bg-amber-100 text-amber-700',
  past_due: 'bg-red-100 text-red-700',
  canceled: 'bg-neutral-200 text-neutral-600',
};

export default async function AdminPage() {
  await requireSuperAdmin();
  const t = await getTranslations('superAdmin');
  const supabase = await createClient();

  const { data } = await supabase.rpc('admin_tenant_overview');
  const rows = (data ?? []) as Overview[];
  const plan = await getPlatformSettings();

  const activeCount = rows.filter((r) => r.status === 'active').length;
  const mrr = activeCount * plan.plan_amount;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <Card>
          <div className="text-2xl font-bold">{rows.length}</div>
          <div className="text-xs text-neutral-500">{t('totalTenants')}</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold">{activeCount}</div>
          <div className="text-xs text-neutral-500">{t('activeSubs')}</div>
        </Card>
        <Card>
          <div className="text-2xl font-bold">{formatPrice(mrr, plan.plan_currency)}</div>
          <div className="text-xs text-neutral-500">{t('mrr')}</div>
        </Card>
      </div>

      <div className="mb-6">
        <PricingSettings settings={plan} />
      </div>

      <Card className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-neutral-100 text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-3">{t('tenants')}</th>
              <th className="px-4 py-3">{t('owner')}</th>
              <th className="px-4 py-3">{t('status')}</th>
              <th className="px-4 py-3">{t('plan')}</th>
              <th className="px-4 py-3">{t('trialEnds')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const end = r.current_period_end ?? r.trial_ends_at;
              return (
                <tr key={r.tenant_id} className="border-b border-neutral-50">
                  <td className="px-4 py-3">
                    <a
                      href={tenantUrl(r.subdomain)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </a>
                    <div className="text-xs text-neutral-400">
                      {r.custom_domain ?? `${r.subdomain}`}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{r.owner_email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLES[r.status ?? 'canceled']
                      }`}
                    >
                      {r.status ?? '—'}
                    </span>
                    {(r.free_months_granted ?? 0) > 0 && (
                      <span className="ml-1 text-xs text-green-600">
                        +{r.free_months_granted}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <PlanSelect tenantId={r.tenant_id} plan={r.plan ?? 'basic'} />
                  </td>
                  <td className="px-4 py-3 text-neutral-500">
                    {end ? new Date(end).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <AwardMonthsButton tenantId={r.tenant_id} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
