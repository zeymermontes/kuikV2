import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { effectivePlan } from '@/lib/plan';
import { getPlatformSettings } from '@/lib/platform';
import { branchAmount } from '@/lib/pricing';
import { formatPrice } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import { tenantUrl } from '@/lib/config';
import type { Branch } from '@/lib/database.types';
import { BranchManager } from '@/components/dashboard/BranchManager';

export default async function BranchesPage() {
  const { tenant, subscription } = await requireManager();
  const t = await getTranslations('branches');

  // Branches are on either tier; each one is a line of the monthly charge.
  const prices = await getPlatformSettings();
  const perBranch = formatPrice(branchAmount(prices, effectivePlan(subscription)), prices.plan_currency);

  const supabase = await createClient();
  const { data } = await supabase
    .from('branches')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('position');

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-1 text-sm text-neutral-500">{t('subtitle')}</p>
      <p className="mb-6 text-sm text-neutral-500">{t('priceNote', { price: perBranch })}</p>
      <BranchManager branches={(data ?? []) as Branch[]} baseUrl={tenantUrl(tenant.subdomain)} />
    </div>
  );
}
