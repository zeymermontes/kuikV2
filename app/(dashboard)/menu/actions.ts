'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { revalidateTenant } from '@/lib/revalidate';
import { requireTenant, requireManager } from '@/lib/auth';
import type { SeparatorStyle, PricedOption, OptionGroup } from '@/lib/database.types';

/**
 * Editing the menu is manager+. RLS already refuses everyone else, but silently
 * — the request succeeds, zero rows change, and the editor looks like it saved.
 * Guarding here turns that into a visible redirect.
 */
async function ctx() {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  return { tenantId: tenant.id, subdomain: tenant.subdomain, supabase };
}

/**
 * Availability is the exception: a waiter marks the kitchen out of something
 * from the floor, through a security-definer RPC that carries its own role
 * check (0045 narrowed it to owner/manager/cashier/waiter, so a host can't).
 */
async function serviceCtx() {
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  return { subdomain: tenant.subdomain, supabase };
}

// Re-render the editor and bust the public menu cache after every mutation.
function revalidate(subdomain: string) {
  revalidatePath('/menu');
  revalidateTenant(subdomain);
}

// ── Categories ─────────────────────────────────────────────────────────────
export async function addCategory(
  name: string,
  branchId: string | null = null,
  parentId: string | null = null,
) {
  const { tenantId, subdomain, supabase } = await ctx();

  // A subcategory lives on its parent's branch and may only hang off a
  // top-level category (the database enforces this too).
  let branch = branchId;
  if (parentId) {
    const { data: parent } = await supabase
      .from('categories')
      .select('branch_id, parent_id, tenant_id')
      .eq('id', parentId)
      .single<{ branch_id: string | null; parent_id: string | null; tenant_id: string }>();
    if (!parent || parent.tenant_id !== tenantId || parent.parent_id) return;
    branch = parent.branch_id;
  }

  // Position is scoped to the sibling list: top level, or within one parent.
  let posQuery = supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  posQuery = parentId ? posQuery.eq('parent_id', parentId) : posQuery.is('parent_id', null);
  const { count } = await posQuery;

  await supabase.from('categories').insert({
    tenant_id: tenantId,
    name,
    position: count ?? 0,
    branch_id: branch,
    parent_id: parentId,
  });
  revalidate(subdomain);
}

/**
 * Move a category under a parent, or back to the top level (`parentId: null`).
 * Refuses moves the one-level rule forbids; the database trigger is the
 * backstop.
 */
export async function setCategoryParent(id: string, parentId: string | null) {
  const { tenantId, subdomain, supabase } = await ctx();

  if (parentId) {
    if (parentId === id) return;
    const [{ data: parent }, { count: childCount }] = await Promise.all([
      supabase
        .from('categories')
        .select('branch_id, parent_id, tenant_id')
        .eq('id', parentId)
        .single<{ branch_id: string | null; parent_id: string | null; tenant_id: string }>(),
      supabase
        .from('categories')
        .select('id', { count: 'exact', head: true })
        .eq('parent_id', id),
    ]);
    // Can't nest under a subcategory, and can't demote a category that has its own.
    if (!parent || parent.tenant_id !== tenantId || parent.parent_id) return;
    if ((childCount ?? 0) > 0) return;

    const { count } = await supabase
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', parentId);
    await supabase
      .from('categories')
      .update({ parent_id: parentId, branch_id: parent.branch_id, position: count ?? 0 })
      .eq('id', id);
  } else {
    const { count } = await supabase
      .from('categories')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('parent_id', null);
    await supabase.from('categories').update({ parent_id: null, position: count ?? 0 }).eq('id', id);
  }

  revalidate(subdomain);
}

export async function updateCategory(
  id: string,
  fields: Partial<{
    name: string;
    icon: string | null;
    icon_image_url: string | null;
    banner_name: string | null;
    banner_image_url: string | null;
    is_visible: boolean;
    station: string | null;
  }>,
) {
  const { subdomain, supabase } = await ctx();
  await supabase.from('categories').update(fields).eq('id', id);
  revalidate(subdomain);
}

export async function deleteCategory(id: string) {
  const { subdomain, supabase } = await ctx();
  await supabase.from('categories').delete().eq('id', id);
  revalidate(subdomain);
}

export async function reorderCategories(ids: string[]) {
  const { supabase, subdomain } = await ctx();
  await Promise.all(
    ids.map((id, i) => supabase.from('categories').update({ position: i }).eq('id', id)),
  );
  revalidate(subdomain);
}

// ── Products ───────────────────────────────────────────────────────────────
export async function addProduct(categoryId: string, name: string) {
  const { tenantId, subdomain, supabase } = await ctx();
  const nextPos = await nextPosition(supabase, categoryId);
  const { data } = await supabase
    .from('products')
    .insert({
      tenant_id: tenantId,
      category_id: categoryId,
      name,
      position: nextPos,
    })
    .select('id')
    .single<{ id: string }>();
  revalidate(subdomain);
  // Return the new id so the editor can auto-open its config drawer.
  return data?.id ?? null;
}

export async function updateProduct(
  id: string,
  fields: Partial<{
    name: string;
    description: string | null;
    price: number | null;
    compare_at_price: number | null;
    cost: number | null;
    sku: string | null;
    prep_time: string | null;
    calories: number | null;
    show_price: boolean;
    image_url: string | null;
    is_available: boolean;
    is_hidden: boolean;
    tags: string[];
    variants: PricedOption[];
    modifiers: PricedOption[];
    removables: string[];
    option_groups: OptionGroup[];
  }>,
) {
  const { subdomain, supabase } = await ctx();
  await supabase.from('products').update(fields).eq('id', id);
  revalidate(subdomain);
}

export async function deleteProduct(id: string) {
  const { subdomain, supabase } = await ctx();
  await supabase.from('products').delete().eq('id', id);
  revalidate(subdomain);
}

/**
 * Toggle a product's availability via a security-definer RPC. Works for any
 * member (including waiters, who lack full menu-write permission).
 */
export async function setProductAvailability(id: string, available: boolean) {
  const { subdomain, supabase } = await serviceCtx();
  await supabase.rpc('set_product_availability', { p_id: id, p_available: available });
  revalidate(subdomain);
}

// ── Separators ─────────────────────────────────────────────────────────────
export async function addSeparator(
  categoryId: string,
  style: SeparatorStyle,
  label: string | null,
) {
  const { tenantId, subdomain, supabase } = await ctx();
  const nextPos = await nextPosition(supabase, categoryId);
  await supabase.from('separators').insert({
    tenant_id: tenantId,
    category_id: categoryId,
    style,
    label,
    position: nextPos,
  });
  revalidate(subdomain);
}

export async function updateSeparator(
  id: string,
  fields: Partial<{ label: string | null; style: SeparatorStyle }>,
) {
  const { subdomain, supabase } = await ctx();
  await supabase.from('separators').update(fields).eq('id', id);
  revalidate(subdomain);
}

export async function deleteSeparator(id: string) {
  const { subdomain, supabase } = await ctx();
  await supabase.from('separators').delete().eq('id', id);
  revalidate(subdomain);
}

// Reorder a mixed list of products + separators within one category.
export async function reorderEntries(
  entries: { kind: 'product' | 'separator'; id: string }[],
) {
  const { subdomain, supabase } = await ctx();
  await Promise.all(
    entries.map((e, i) =>
      supabase
        .from(e.kind === 'product' ? 'products' : 'separators')
        .update({ position: i })
        .eq('id', e.id),
    ),
  );
  revalidate(subdomain);
}

// Helper: next position across both products and separators in a category.
async function nextPosition(
  supabase: Awaited<ReturnType<typeof createClient>>,
  categoryId: string,
): Promise<number> {
  const [{ data: p }, { data: s }] = await Promise.all([
    supabase
      .from('products')
      .select('position')
      .eq('category_id', categoryId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle<{ position: number }>(),
    supabase
      .from('separators')
      .select('position')
      .eq('category_id', categoryId)
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle<{ position: number }>(),
  ]);
  return Math.max(p?.position ?? -1, s?.position ?? -1) + 1;
}
