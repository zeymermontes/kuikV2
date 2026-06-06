import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import { createClient } from '@/lib/supabase/server';
import { tenantUrl } from '@/lib/config';
import type { Branch } from '@/lib/database.types';
import { BranchManager } from '@/components/dashboard/BranchManager';
import { ProUpsell } from '@/components/dashboard/ProUpsell';

export default async function BranchesPage() {
  const { tenant, subscription } = await requireManager();
  const t = await getTranslations('branches');

  if (!isPro(subscription)) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
        <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
        <ProUpsell feature={t('title')} />
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from('branches')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('position');

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <BranchManager branches={(data ?? []) as Branch[]} baseUrl={tenantUrl(tenant.subdomain)} />
    </div>
  );
}
