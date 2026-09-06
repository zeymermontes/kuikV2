'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { revalidateTenant } from '@/lib/revalidate';
import type { Ingredient, PurchaseLine, RecipeLine } from '@/lib/database.types';
import { UNITS, purchaseTotal, recipeCost } from '@/lib/inventory';

const UUID = /^[0-9a-f-]{36}$/i;

export interface IngredientInput {
  id?: string;
  name: string;
  unit: string;
  min_stock: number | null;
  cost_per_unit: number;
  supplier: string | null;
  auto_86: boolean;
  active: boolean;
  /** Only on create: the opening stock. */
  stock?: number;
}

export async function saveIngredient(input: IngredientInput): Promise<{ error?: string; id?: string }> {
  const { tenant } = await requireManager();
  const name = input.name.trim().slice(0, 80);
  if (!name) return { error: 'name' };
  const unit = (UNITS as readonly string[]).includes(input.unit) ? input.unit : 'pza';
  const row = {
    tenant_id: tenant.id,
    name,
    unit,
    min_stock: input.min_stock != null && input.min_stock >= 0 ? input.min_stock : null,
    cost_per_unit: Math.max(0, Number(input.cost_per_unit) || 0),
    supplier: input.supplier?.trim() || null,
    auto_86: !!input.auto_86,
    active: !!input.active,
    updated_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  if (input.id) {
    const { error } = await supabase.from('ingredients').update(row).eq('tenant_id', tenant.id).eq('id', input.id);
    if (error) return { error: error.message };
    revalidatePath('/inventory');
    return { id: input.id };
  }
  const { count } = await supabase.from('ingredients').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
  const { data, error } = await supabase
    .from('ingredients')
    .insert({ ...row, stock: Math.max(0, Number(input.stock) || 0), position: count ?? 0 })
    .select('id')
    .maybeSingle();
  if (error) return { error: error.message };
  revalidatePath('/inventory');
  return { id: (data as { id: string } | null)?.id };
}

export async function deleteIngredient(id: string) {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('ingredients').delete().eq('tenant_id', tenant.id).eq('id', id);
  revalidatePath('/inventory');
}

/** Waste, a manual adjustment, or a count (which sets the stock to what was counted). */
export async function recordMovement(input: { ingredientId: string; kind: 'waste' | 'adjust' | 'count'; qty: number; note?: string | null }): Promise<{ error?: string }> {
  const { tenant, user } = await requireManager();
  if (!UUID.test(input.ingredientId)) return { error: 'ingredient' };
  const qty = Number(input.qty);
  if (!Number.isFinite(qty)) return { error: 'qty' };
  const supabase = await createClient();
  const note = input.note?.trim().slice(0, 200) || null;
  const { error } =
    input.kind === 'count'
      ? await supabase.rpc('count_stock', { p_tenant: tenant.id, p_ingredient: input.ingredientId, p_counted: Math.max(0, qty), p_note: note, p_user: user.id })
      : await supabase.rpc('move_stock', {
          p_tenant: tenant.id,
          p_ingredient: input.ingredientId,
          p_kind: input.kind,
          // Waste is always a subtraction, typed as a positive number.
          p_qty: input.kind === 'waste' ? -Math.abs(qty) : qty,
          p_ref: null,
          p_note: note,
          p_employee: null,
          p_user: user.id,
        });
  if (error) return { error: error.message };
  revalidatePath('/inventory');
  return {};
}

// ── Recipes ─────────────────────────────────────────────────────────────────

export async function listIngredients(): Promise<Ingredient[]> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const { data } = await supabase.from('ingredients').select('*').eq('tenant_id', tenant.id).eq('active', true).order('position').order('name');
  return (data ?? []) as Ingredient[];
}

export async function getRecipe(productId: string): Promise<RecipeLine[]> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const { data } = await supabase.from('product_ingredients').select('*').eq('tenant_id', tenant.id).eq('product_id', productId);
  return (data ?? []) as RecipeLine[];
}

/** Replace a product's recipe and refresh its cost from it. */
export async function setRecipe(productId: string, lines: { ingredient_id: string; qty: number }[]): Promise<{ error?: string; cost?: number }> {
  const { tenant } = await requireManager();
  if (!UUID.test(productId)) return { error: 'product' };
  const clean = lines.filter((l) => UUID.test(l.ingredient_id) && Number(l.qty) > 0).map((l) => ({ product_id: productId, ingredient_id: l.ingredient_id, tenant_id: tenant.id, qty: Number(l.qty) }));
  const supabase = await createClient();
  await supabase.from('product_ingredients').delete().eq('tenant_id', tenant.id).eq('product_id', productId);
  if (clean.length) {
    const { error } = await supabase.from('product_ingredients').insert(clean);
    if (error) return { error: error.message };
  }
  const { data: ings } = await supabase.from('ingredients').select('id, cost_per_unit').eq('tenant_id', tenant.id);
  const cost = clean.length ? recipeCost(clean, (ings ?? []) as Pick<Ingredient, 'id' | 'cost_per_unit'>[]) : null;
  if (cost != null) await supabase.from('products').update({ cost }).eq('id', productId).eq('tenant_id', tenant.id);
  revalidatePath('/menu');
  revalidateTenant(tenant.subdomain, tenant.custom_domain);
  return { cost: cost ?? undefined };
}

/** Simple tracking: an ingredient named like the product, one piece per sale. */
export async function trackProductStock(productId: string, productName: string, stock: number): Promise<{ error?: string }> {
  const created = await saveIngredient({ name: productName.slice(0, 80), unit: 'pza', min_stock: 2, cost_per_unit: 0, supplier: null, auto_86: true, active: true, stock });
  if (!created.id) return { error: created.error ?? 'create' };
  return setRecipe(productId, [{ ingredient_id: created.id, qty: 1 }]);
}

/** Refresh every product's cost from its recipe (products without one keep theirs). */
export async function recalcProductCosts(): Promise<{ updated: number }> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const [{ data: recipes }, { data: ings }] = await Promise.all([
    supabase.from('product_ingredients').select('*').eq('tenant_id', tenant.id),
    supabase.from('ingredients').select('id, cost_per_unit').eq('tenant_id', tenant.id),
  ]);
  const byProduct = new Map<string, RecipeLine[]>();
  for (const r of (recipes ?? []) as RecipeLine[]) byProduct.set(r.product_id, [...(byProduct.get(r.product_id) ?? []), r]);
  let updated = 0;
  for (const [productId, lines] of byProduct) {
    await supabase.from('products').update({ cost: recipeCost(lines, (ings ?? []) as Pick<Ingredient, 'id' | 'cost_per_unit'>[]) }).eq('id', productId).eq('tenant_id', tenant.id);
    updated++;
  }
  revalidatePath('/inventory');
  revalidatePath('/reports');
  return { updated };
}

// ── Purchases ───────────────────────────────────────────────────────────────

export async function savePurchase(input: { id?: string; supplier: string | null; note: string | null; items: PurchaseLine[]; status: 'draft' | 'sent' }): Promise<{ error?: string }> {
  const { tenant } = await requireManager();
  const items = input.items.filter((l) => UUID.test(l.ingredient_id) && Number(l.qty) > 0).map((l) => ({ ingredient_id: l.ingredient_id, name: l.name.slice(0, 80), qty: Number(l.qty), cost: Math.max(0, Number(l.cost) || 0) }));
  if (items.length === 0) return { error: 'items' };
  const row = { tenant_id: tenant.id, supplier: input.supplier?.trim() || null, note: input.note?.trim() || null, items, total: purchaseTotal(items), status: input.status, updated_at: new Date().toISOString() };
  const supabase = await createClient();
  const { error } = input.id
    ? await supabase.from('purchase_orders').update(row).eq('tenant_id', tenant.id).eq('id', input.id).in('status', ['draft', 'sent'])
    : await supabase.from('purchase_orders').insert(row);
  if (error) return { error: error.message };
  revalidatePath('/inventory');
  return {};
}

/** Goods arrived: stock in, last cost refreshed, order closed. */
export async function receivePurchase(id: string): Promise<{ error?: string }> {
  const { tenant, user } = await requireManager();
  const supabase = await createClient();
  const { data } = await supabase.from('purchase_orders').select('*').eq('tenant_id', tenant.id).eq('id', id).maybeSingle();
  const po = data as { id: string; status: string; items: PurchaseLine[] } | null;
  if (!po || po.status === 'received' || po.status === 'cancelled') return { error: 'status' };
  for (const l of po.items) {
    await supabase.rpc('move_stock', { p_tenant: tenant.id, p_ingredient: l.ingredient_id, p_kind: 'purchase', p_qty: Number(l.qty), p_ref: po.id, p_note: null, p_employee: null, p_user: user.id });
    if (Number(l.cost) > 0) await supabase.from('ingredients').update({ cost_per_unit: Number(l.cost) }).eq('id', l.ingredient_id).eq('tenant_id', tenant.id);
  }
  await supabase.from('purchase_orders').update({ status: 'received', received_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/inventory');
  return {};
}

export async function cancelPurchase(id: string) {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('purchase_orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('tenant_id', tenant.id).eq('id', id).in('status', ['draft', 'sent']);
  revalidatePath('/inventory');
}
