import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { resolveMenuSettings } from '@/lib/menu-settings';
import type { Promotion } from '@/lib/database.types';
import { PromotionsManager } from '@/components/dashboard/PromotionsManager';

export default async function PromotionsPage() {
  const { tenant, theme } = await requireManager();
  const t = await getTranslations('promotions');
  const supabase = await createClient();
  const [{ data: promos }, { data: categories }, { data: products }] = await Promise.all([
    supabase.from('promotions').select('*').eq('tenant_id', tenant.id).order('position').order('created_at'),
    supabase.from('categories').select('id, name, parent_id').eq('tenant_id', tenant.id).is('branch_id', null).order('position'),
    supabase.from('products').select('id, name, category_id').eq('tenant_id', tenant.id).eq('is_hidden', false).order('position'),
  ]);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <PromotionsManager
        promotions={(promos ?? []) as Promotion[]}
        categories={((categories ?? []) as { id: string; name: string; parent_id: string | null }[]).filter((c) => !c.parent_id)}
        products={(products ?? []) as { id: string; name: string; category_id: string }[]}
        currency={resolveMenuSettings(theme.settings).currency}
      />
    </div>
  );
}
