import { getTranslations } from 'next-intl/server';
import { requireOwner } from '@/lib/auth';
import { DesignForm } from '@/components/dashboard/DesignForm';
import { tenantUrl } from '@/lib/config';
import { createClient } from '@/lib/supabase/server';
import type { CategoryTheme } from '@/lib/database.types';

export default async function DesignPage() {
  const { theme, tenant } = await requireOwner();
  // The main menu's sections, for the per-category tab colours in the Navigation card.
  const supabase = await createClient();
  const { data: cats } = await supabase
    .from('categories')
    .select('id, name, theme')
    .eq('tenant_id', tenant.id)
    .is('branch_id', null)
    .is('parent_id', null)
    .eq('is_visible', true)
    .order('position');
  const categories = ((cats ?? []) as { id: string; name: string; theme: CategoryTheme | null }[]);
  const t = await getTranslations('design');

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
      <DesignForm theme={theme} previewUrl={tenantUrl(tenant.subdomain)} published={tenant.is_published} categories={categories} />
    </div>
  );
}
