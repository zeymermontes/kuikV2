'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireTenant } from '@/lib/auth';
import type { SeparatorStyle, PricedOption, OptionGroup } from '@/lib/database.types';

// All actions resolve the caller's tenant and rely on RLS for authorization.
async function ctx() {
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  return { tenantId: tenant.id, subdomain: tenant.subdomain, supabase };
}

// Re-render the editor and bust the public menu cache after every mutation.
function revalidate(subdomain: string) {
  revalidatePath('/menu');
  revalidatePath(`/s/${subdomain}`);
}

// ── Categories ─────────────────────────────────────────────────────────────
export async function addCategory(name: string, branchId: string | null = null) {
  const { tenantId, subdomain, supabase } = await ctx();
  const { count } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  await supabase
    .from('categories')
    .insert({ tenant_id: tenantId, name, position: count ?? 0, branch_id: branchId });
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
  await supabase.from('products').insert({
    tenant_id: tenantId,
    category_id: categoryId,
    name,
    position: nextPos,
  });
  revalidate(subdomain);
}

export async function updateProduct(
  id: string,
  fields: Partial<{
    name: string;
    description: string | null;
    price: number | null;
    compare_at_price: number | null;
    prep_time: string | null;
    calories: number | null;
    show_price: boolean;
    image_url: string | null;
    is_available: boolean;
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
  const { subdomain, supabase } = await ctx();
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
