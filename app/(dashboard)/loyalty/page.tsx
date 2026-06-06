import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import { createClient } from '@/lib/supabase/server';
import type { LoyaltyProgram } from '@/lib/database.types';
import { LoyaltyForm } from '@/components/dashboard/LoyaltyForm';
import { LoyaltyAccredit } from '@/components/dashboard/LoyaltyAccredit';
import { ProUpsell } from '@/components/dashboard/ProUpsell';

export default async function LoyaltyPage() {
  const { tenant, role, subscription } = await requireTenant();
  const t = await getTranslations('loyalty');
  const supabase = await createClient();

  if (!isPro(subscription)) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
        <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
        <ProUpsell feature={t('title')} />
      </div>
    );
  }

  const { data } = await supabase
    .from('loyalty_program')
    .select('*')
    .eq('tenant_id', tenant.id)
    .maybeSingle<LoyaltyProgram>();

  const program: LoyaltyProgram = data ?? {
    tenant_id: tenant.id,
    enabled: false,
    type: 'stamps',
    stamps_needed: 10,
    reward_description: null,
    points_per_currency: 1,
    points_for_reward: null,
    points_reward_description: null,
    updated_at: new Date(0).toISOString(),
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>

      <div className="grid gap-5 lg:grid-cols-2">
        {role === 'owner' && <LoyaltyForm program={program} />}
        {program.enabled ? (
          <LoyaltyAccredit program={program} />
        ) : (
          role !== 'owner' && (
            <p className="text-sm text-neutral-500">{t('disabled')}</p>
          )
        )}
      </div>
    </div>
  );
}
