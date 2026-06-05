import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Category, Product, Separator } from '@/lib/database.types';
import { MenuEditor } from '@/components/dashboard/menu/MenuEditor';
import { MenuModeSwitch } from '@/components/dashboard/MenuModeSwitch';

export default async function MenuPage() {
  const { tenant, theme } = await requireTenant();
  const t = await getTranslations('menuEditor');
  const supabase = await createClient();

  const [{ data: categories }, { data: products }, { data: separators }] =
    await Promise.all([
      supabase.from('categories').select('*').eq('tenant_id', tenant.id).order('position'),
      supabase.from('products').select('*').eq('tenant_id', tenant.id).order('position'),
      supabase.from('separators').select('*').eq('tenant_id', tenant.id).order('position'),
    ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>
      <MenuModeSwitch tenantId={tenant.id} mode={theme.menu_mode} pdfUrl={theme.menu_pdf_url} />
      {theme.menu_mode === 'pdf' && (
        <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {t('pdfModeNote')}
        </p>
      )}
      <MenuEditor
        tenantId={tenant.id}
        categories={(categories ?? []) as Category[]}
        products={(products ?? []) as Product[]}
        separators={(separators ?? []) as Separator[]}
      />
    </div>
  );
}
