import { getTranslations } from 'next-intl/server';
import { requireSuperAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { getPlatformSettings } from '@/lib/platform';
import { tenantUrl, tenantBaseUrl } from '@/lib/config';
import { formatPrice } from '@/lib/utils';
import { Card } from '@/components/ui';
import { AwardMonthsButton } from '@/components/dashboard/AwardMonthsButton';
import { TenantAdminActions } from '@/components/dashboard/TenantAdminActions';
import { LandingControls } from '@/components/dashboard/LandingControls';
import { PricingSettings } from '@/components/dashboard/PricingSettings';
import { AiPlatformSettings } from '@/components/dashboard/AiPlatformSettings';
import { LandingAiPrompt } from '@/components/dashboard/LandingAiPrompt';
import { listAiUsage } from './actions';
import { PlanSelect } from '@/components/dashboard/PlanSelect';
import type { SubscriptionStatus } from '@/lib/database.types';

// Already dynamic in practice, because requireSuperAdmin() reads cookies — but
// this page also reads secrets from process.env to report which provider keys
// exist, and that must never be evaluated at build time and cached.
export const dynamic = 'force-dynamic';

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

  // Which provider keys are actually present. Read here rather than in the
  // client component: these are server-only env vars, and only their PRESENCE
  // ever crosses to the browser — never a value.
  const configuredProviders = (
    [
      ['deepseek', process.env.AI_DEEPSEEK_KEY],
      ['openai', process.env.AI_OPENAI_KEY],
      ['gemini', process.env.AI_GEMINI_KEY],
      ['anthropic', process.env.AI_ANTHROPIC_KEY],
      ['kimi', process.env.AI_KIMI_KEY],
    ] as const
  )
    .filter(([, key]) => Boolean(key))
    .map(([id]) => id as string);

  const [{ data: aiRow }, aiUsage] = await Promise.all([
    supabase
      .from('platform_settings')
      .select('ai_enabled, whatsapp_enabled, ai_default_provider, ai_default_model, ai_monthly_message_cap')
      .eq('id', 1)
      .maybeSingle(),
    listAiUsage(),
  ]);

  const aiSettings = {
    ai_enabled: (aiRow as { ai_enabled?: boolean } | null)?.ai_enabled ?? true,
    whatsapp_enabled: (aiRow as { whatsapp_enabled?: boolean } | null)?.whatsapp_enabled ?? true,
    ai_default_provider:
      (aiRow as { ai_default_provider?: string } | null)?.ai_default_provider ??
      process.env.AI_DEFAULT_PROVIDER ??
      'deepseek',
    ai_default_model: (aiRow as { ai_default_model?: string | null } | null)?.ai_default_model ?? null,
    ai_monthly_message_cap:
      (aiRow as { ai_monthly_message_cap?: number } | null)?.ai_monthly_message_cap ?? 3000,
  };

  const { data } = await supabase.rpc('admin_tenant_overview');
  const rows = (data ?? []) as Overview[];
  const plan = await getPlatformSettings();

  // Per-tenant landing state: the super-admin's home-mode selection and whether
  // a custom site has been uploaded.
  const { data: landingRows } = await supabase
    .from('tenant_landing')
    .select('tenant_id, landing_mode, custom_entry');
  const landingByTenant = new Map(
    (landingRows ?? []).map((r) => {
      const row = r as {
        tenant_id: string;
        landing_mode: 'builder' | 'custom' | 'none' | null;
        custom_entry: string | null;
      };
      return [
        row.tenant_id,
        {
          mode: row.landing_mode ?? 'builder',
          entry: row.custom_entry,
        },
      ] as const;
    }),
  );

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

      {/* Platform-level reference: the brief is identical for every tenant, so
          it lives here once rather than repeating inside each row's controls. */}
      <div className="mb-6">
        <LandingAiPrompt />
      </div>

      <div className="mb-6">
        <AiPlatformSettings
          settings={aiSettings}
          usage={aiUsage}
          configuredProviders={configuredProviders}
        />
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
              <th className="px-4 py-3">{t('landing')}</th>
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
                  <td className="px-4 py-3">
                    {(() => {
                      const l = landingByTenant.get(r.tenant_id);
                      return (
                        <LandingControls
                          tenantId={r.tenant_id}
                          mode={l?.mode ?? 'builder'}
                          hasCustom={Boolean(l?.entry)}
                          // Clean public URL for the uploaded site, e.g.
                          // laseisdos.kuik.mx/landing — shown regardless of mode.
                          previewUrl={
                            l?.entry
                              ? `${tenantBaseUrl(r.subdomain, r.custom_domain)}/landing`
                              : null
                          }
                        />
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <TenantAdminActions tenantId={r.tenant_id} name={r.name} />
                      <AwardMonthsButton tenantId={r.tenant_id} />
                    </div>
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
