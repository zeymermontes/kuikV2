import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { resolveMenuSettings } from '@/lib/menu-settings';
import type { Ingredient, PurchaseOrder, StockMovement } from '@/lib/database.types';
import { InventoryManager } from '@/components/dashboard/InventoryManager';

export default async function InventoryPage() {
  const { tenant, theme } = await requireManager();
  const t = await getTranslations('inventory');
  const supabase = await createClient();
  const [{ data: ingredients }, { data: movements }, { data: purchases }, { data: recipeCounts }] = await Promise.all([
    supabase.from('ingredients').select('*').eq('tenant_id', tenant.id).order('position').order('name'),
    supabase.from('stock_movements').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(200),
    supabase.from('purchase_orders').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(100),
    supabase.from('product_ingredients').select('ingredient_id').eq('tenant_id', tenant.id),
  ]);
  const usedBy = new Map<string, number>();
  for (const r of (recipeCounts ?? []) as { ingredient_id: string }[]) usedBy.set(r.ingredient_id, (usedBy.get(r.ingredient_id) ?? 0) + 1);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <InventoryManager
        ingredients={(ingredients ?? []) as Ingredient[]}
        movements={(movements ?? []) as StockMovement[]}
        purchases={(purchases ?? []) as PurchaseOrder[]}
        usedBy={Object.fromEntries(usedBy)}
        currency={resolveMenuSettings(theme.settings).currency}
      />
    </div>
  );
}
