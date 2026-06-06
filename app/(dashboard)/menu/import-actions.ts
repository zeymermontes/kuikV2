'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

// One product row parsed from the spreadsheet (headers already normalised client-side).
export interface ImportRow {
  category: string;
  name: string;
  description?: string | null;
  price?: number | null;
  compareAt?: number | null;
  available?: boolean;
  tags?: string[];
}

export interface ImportPreview {
  newCategories: number;
  newProducts: number;
  updatedProducts: number;
  missingProducts: number;
  missingCategories: number;
}

const norm = (s: string) => (s ?? '').trim().toLowerCase();

async function ctx() {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  return { tenantId: tenant.id, subdomain: tenant.subdomain, supabase };
}

function branchFilter<T>(q: T, branchId: string | null): T {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query = q as any;
  return branchId ? query.eq('branch_id', branchId) : query.is('branch_id', null);
}

async function loadExisting(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  branchId: string | null,
) {
  const { data: cats } = await branchFilter(
    supabase.from('categories').select('id, name, position').eq('tenant_id', tenantId),
    branchId,
  );
  const catList = (cats ?? []) as { id: string; name: string; position: number }[];
  const catIds = catList.map((c) => c.id);
  const { data: prods } = catIds.length
    ? await supabase.from('products').select('id, name, category_id, position').in('category_id', catIds)
    : { data: [] };
  const prodList = (prods ?? []) as { id: string; name: string; category_id: string; position: number }[];
  return { catList, prodList };
}

/** Dry-run: count what an import would create / update / leave missing. */
export async function previewImport(rows: ImportRow[], branchId: string | null): Promise<ImportPreview> {
  const { tenantId, supabase } = await ctx();
  const { catList, prodList } = await loadExisting(supabase, tenantId, branchId);

  const catIdByName = new Map(catList.map((c) => [norm(c.name), c.id]));
  const fileCatNames = new Set(rows.map((r) => norm(r.category)).filter(Boolean));
  const prodByKey = new Map(prodList.map((p) => [`${p.category_id}|${norm(p.name)}`, p]));

  let newCategories = 0;
  for (const cn of fileCatNames) if (!catIdByName.has(cn)) newCategories++;

  const seen = new Set<string>();
  let newProducts = 0;
  let updatedProducts = 0;
  for (const r of rows) {
    if (!norm(r.name)) continue;
    const catId = catIdByName.get(norm(r.category));
    const ex = catId ? prodByKey.get(`${catId}|${norm(r.name)}`) : undefined;
    if (ex) {
      updatedProducts++;
      seen.add(ex.id);
    } else {
      newProducts++;
    }
  }

  return {
    newCategories,
    newProducts,
    updatedProducts,
    missingProducts: prodList.filter((p) => !seen.has(p.id)).length,
    missingCategories: catList.filter((c) => !fileCatNames.has(norm(c.name))).length,
  };
}

/** Apply an import: create/update by (category, product) name; optionally delete missing. */
export async function applyImport(
  rows: ImportRow[],
  branchId: string | null,
  deleteMissing: boolean,
): Promise<void> {
  const { tenantId, subdomain, supabase } = await ctx();
  const { catList, prodList } = await loadExisting(supabase, tenantId, branchId);

  const catIdByName = new Map(catList.map((c) => [norm(c.name), c.id]));
  let nextCatPos = Math.max(-1, ...catList.map((c) => c.position)) + 1;

  // First-seen raw casing for new category names.
  const rawCatName = new Map<string, string>();
  for (const r of rows) {
    const k = norm(r.category);
    if (k && !rawCatName.has(k)) rawCatName.set(k, r.category.trim());
  }

  const seenCatIds = new Set<string>();
  for (const [cn, raw] of rawCatName) {
    let id = catIdByName.get(cn);
    if (!id) {
      const { data } = await supabase
        .from('categories')
        .insert({ tenant_id: tenantId, branch_id: branchId, name: raw, position: nextCatPos++ })
        .select('id')
        .single<{ id: string }>();
      if (!data) continue;
      id = data.id;
      catIdByName.set(cn, id);
    }
    seenCatIds.add(id);
  }

  const prodByKey = new Map(prodList.map((p) => [`${p.category_id}|${norm(p.name)}`, p]));
  const maxPos = new Map<string, number>();
  for (const p of prodList) maxPos.set(p.category_id, Math.max(maxPos.get(p.category_id) ?? -1, p.position));

  const seenProdIds = new Set<string>();
  for (const r of rows) {
    if (!norm(r.name)) continue;
    const catId = catIdByName.get(norm(r.category));
    if (!catId) continue;
    const fields = {
      name: r.name.trim(),
      description: r.description?.trim() || null,
      price: r.price ?? null,
      compare_at_price: r.compareAt ?? null,
      is_available: r.available ?? true,
      tags: r.tags ?? [],
    };
    const ex = prodByKey.get(`${catId}|${norm(r.name)}`);
    if (ex) {
      await supabase.from('products').update(fields).eq('id', ex.id);
      seenProdIds.add(ex.id);
    } else {
      const pos = (maxPos.get(catId) ?? -1) + 1;
      maxPos.set(catId, pos);
      const { data } = await supabase
        .from('products')
        .insert({ tenant_id: tenantId, category_id: catId, ...fields, position: pos })
        .select('id')
        .single<{ id: string }>();
      if (data) seenProdIds.add(data.id);
    }
  }

  if (deleteMissing) {
    const missingProdIds = prodList.filter((p) => !seenProdIds.has(p.id)).map((p) => p.id);
    if (missingProdIds.length) await supabase.from('products').delete().in('id', missingProdIds);
    const missingCatIds = catList.filter((c) => !seenCatIds.has(c.id)).map((c) => c.id);
    if (missingCatIds.length) await supabase.from('categories').delete().in('id', missingCatIds);
  }

  revalidatePath('/menu');
  revalidatePath(`/s/${subdomain}`);
}
