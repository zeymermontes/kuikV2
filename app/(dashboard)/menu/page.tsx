import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import { createClient } from '@/lib/supabase/server';
import type { Category, Product, Separator, BranchLite } from '@/lib/database.types';
import { MenuEditor } from '@/components/dashboard/menu/MenuEditor';
import { MenuModeSwitch } from '@/components/dashboard/MenuModeSwitch';
import { MenuImportExport } from '@/components/dashboard/menu/MenuImportExport';
import { WaiterMenu } from '@/components/dashboard/menu/WaiterMenu';

export default async function MenuPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const { tenant, theme, role, subscription } = await requireTenant();
  const t = await getTranslations('menuEditor');
  const supabase = await createClient();

  // Independent-menu branches the owner/manager can edit (Pro only).
  let branches: BranchLite[] = [];
  if (isPro(subscription) && role !== 'waiter') {
    const { data } = await supabase
      .from('branches')
      .select('id, name, slug, menu_mode')
      .eq('tenant_id', tenant.id)
      .eq('menu_mode', 'independent')
      .order('position');
    branches = (data ?? []) as BranchLite[];
  }
  const sel = (await searchParams).branch ?? null;
  const activeBranchId = branches.find((b) => b.id === sel)?.id ?? null;

  // Categories for the active menu (main = branch_id null, or a branch's own).
  let catQuery = supabase.from('categories').select('*').eq('tenant_id', tenant.id).order('position');
  catQuery = activeBranchId ? catQuery.eq('branch_id', activeBranchId) : catQuery.is('branch_id', null);

  const [{ data: categories }, { data: products }, { data: separators }] = await Promise.all([
    catQuery,
    supabase.from('products').select('*').eq('tenant_id', tenant.id).order('position'),
    supabase.from('separators').select('*').eq('tenant_id', tenant.id).order('position'),
  ]);

  if (role === 'waiter') {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
        <p className="mb-6 text-sm text-neutral-500">{t('waiterHint')}</p>
        <WaiterMenu
          categories={(categories ?? []) as Category[]}
          products={(products ?? []) as Product[]}
        />
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">{t('title')}</h1>

      {branches.length > 0 && (
        <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
          <BranchTab href="/menu" label={t('mainMenu')} active={!activeBranchId} />
          {branches.map((b) => (
            <BranchTab
              key={b.id}
              href={`/menu?branch=${b.id}`}
              label={b.name}
              active={activeBranchId === b.id}
            />
          ))}
        </div>
      )}

      {/* PDF mode applies to the main menu only. */}
      {!activeBranchId && (
        <>
          <MenuModeSwitch tenantId={tenant.id} mode={theme.menu_mode} pdfUrl={theme.menu_pdf_url} />
          {theme.menu_mode === 'pdf' && (
            <p className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              {t('pdfModeNote')}
            </p>
          )}
        </>
      )}

      <MenuImportExport
        branchId={activeBranchId}
        categories={(categories ?? []) as Category[]}
        products={(products ?? []) as Product[]}
      />

      <MenuEditor
        tenantId={tenant.id}
        branchId={activeBranchId}
        categories={(categories ?? []) as Category[]}
        products={(products ?? []) as Product[]}
        separators={(separators ?? []) as Separator[]}
      />
    </div>
  );
}

function BranchTab({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
        active ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
      }`}
    >
      {label}
    </Link>
  );
}
