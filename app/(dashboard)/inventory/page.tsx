import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { resolveMenuSettings } from '@/lib/menu-settings';
import type { Ingredient, IngredientStock, PurchaseOrder, StockMovement } from '@/lib/database.types';
import { InventoryManager } from '@/components/dashboard/InventoryManager';
import { branchFilter } from '@/lib/branches';

/** `?branch=`: that branch's shelf (ingredient_stock, 0083); none is the main location, on the ingredient itself. */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  const { tenant, theme } = await requireManager();
  const t = await getTranslations('inventory');
  const supabase = await createClient();
  const { data: branchRows } = await supabase.from('branches').select('id, name').eq('tenant_id', tenant.id).order('position');
  const branches = (branchRows ?? []) as { id: string; name: string }[];
  const branchParam = (await searchParams).branch ?? '';
  const branchId = branches.some((b) => b.id === branchParam) ? branchParam : null;
  const [{ data: rawIngredients }, { data: movements }, { data: purchases }, { data: recipeCounts }, { data: stockRows }] = await Promise.all([
    supabase.from('ingredients').select('*').eq('tenant_id', tenant.id).order('position').order('name'),
    branchFilter(supabase.from('stock_movements').select('*').eq('tenant_id', tenant.id), branchId).order('created_at', { ascending: false }).limit(200),
    branchFilter(supabase.from('purchase_orders').select('*').eq('tenant_id', tenant.id), branchId).order('created_at', { ascending: false }).limit(100),
    supabase.from('product_ingredients').select('ingredient_id').eq('tenant_id', tenant.id),
    branchId ? supabase.from('ingredient_stock').select('*').eq('tenant_id', tenant.id).eq('branch_id', branchId) : Promise.resolve({ data: [] as IngredientStock[] }),
  ]);
  // At a branch, the ingredient's stock and minimum are the branch's row (0 until it moves).
  const stockByIngredient = new Map(((stockRows ?? []) as IngredientStock[]).map((r) => [r.ingredient_id, r]));
  const ingredients = ((rawIngredients ?? []) as Ingredient[]).map((i) =>
    branchId ? { ...i, stock: Number(stockByIngredient.get(i.id)?.stock ?? 0), min_stock: stockByIngredient.get(i.id)?.min_stock ?? i.min_stock } : i,
  );
  const usedBy = new Map<string, number>();
  for (const r of (recipeCounts ?? []) as { ingredient_id: string }[]) usedBy.set(r.ingredient_id, (usedBy.get(r.ingredient_id) ?? 0) + 1);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <InventoryManager
        branchId={branchId}
        branches={branches}
        ingredients={ingredients}
        movements={(movements ?? []) as StockMovement[]}
        purchases={(purchases ?? []) as PurchaseOrder[]}
        usedBy={Object.fromEntries(usedBy)}
        currency={resolveMenuSettings(theme.settings).currency}
      />
    </div>
  );
}
