'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { IMPORT_DESIGN_KEYS, type FullImportPayload, type ImportPreview, type ImportProduct } from '@/lib/menu-import';

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
    supabase.from('categories').select('id, name, position, icon').eq('tenant_id', tenantId),
    branchId,
  );
  const catList = (cats ?? []) as { id: string; name: string; position: number; icon: string | null }[];
  const ids = catList.map((c) => c.id);
  const { data: prods } = ids.length
    ? await supabase.from('products').select('id, name, category_id, position').in('category_id', ids)
    : { data: [] };
  const prodList = (prods ?? []) as { id: string; name: string; category_id: string; position: number }[];
  return { catList, prodList };
}

/**
 * Resolve an image reference to a hosted URL. Already-hosted (our Supabase) URLs
 * pass through; external URLs are fetched and re-hosted; bare filenames (not yet
 * uploaded) resolve to null.
 */
async function resolveImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  ref: string | null | undefined,
): Promise<string | null> {
  if (!ref || !/^https?:\/\//i.test(ref)) return null;
  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (supaUrl && ref.startsWith(supaUrl)) return ref;
  try {
    const res = await fetch(ref);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') || 'image/jpeg';
    const ext = (ct.split('/')[1] || 'jpg').split(';')[0].slice(0, 5);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const path = `${tenantId}/imported/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from('media').upload(path, bytes, { contentType: ct });
    if (error) return null;
    return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
  } catch {
    return null;
  }
}

export async function previewFullImport(
  payload: FullImportPayload,
  branchId: string | null,
): Promise<ImportPreview> {
  const { tenantId, supabase } = await ctx();
  const { catList, prodList } = await loadExisting(supabase, tenantId, branchId);

  const catIdByName = new Map(catList.map((c) => [norm(c.name), c.id]));
  const prodByKey = new Map(prodList.map((p) => [`${p.category_id}|${norm(p.name)}`, p]));
  const fileCatNames = new Set(payload.categories.map((c) => norm(c.name)));

  let newCategories = 0;
  for (const cn of fileCatNames) if (!catIdByName.has(cn)) newCategories++;

  const seen = new Set<string>();
  let newProducts = 0;
  let updatedProducts = 0;
  for (const c of payload.categories) {
    const catId = catIdByName.get(norm(c.name));
    for (const p of c.products) {
      if (!norm(p.name)) continue;
      const ex = catId ? prodByKey.get(`${catId}|${norm(p.name)}`) : undefined;
      if (ex) {
        updatedProducts++;
        seen.add(ex.id);
      } else {
        newProducts++;
      }
    }
  }

  return {
    newCategories,
    newProducts,
    updatedProducts,
    missingProducts: prodList.filter((p) => !seen.has(p.id)).length,
    missingCategories: catList.filter((c) => !fileCatNames.has(norm(c.name))).length,
    hasDesign: Boolean(payload.design),
  };
}

export async function applyFullImport(
  payload: FullImportPayload,
  branchId: string | null,
  deleteMissing: boolean,
): Promise<void> {
  const { tenantId, subdomain, supabase } = await ctx();

  // ── Design (theme) ──────────────────────────────────────────────────────
  if (payload.design && branchId === null) {
    const d = payload.design;
    const theme: Record<string, unknown> = {};
    for (const k of IMPORT_DESIGN_KEYS) {
      if (d[k] != null) theme[k] = d[k];
    }
    if (d.background_image) {
      const url = await resolveImage(supabase, tenantId, d.background_image);
      if (url) theme.background_image_url = url;
    }
    if (Object.keys(theme).length > 0) {
      theme.updated_at = new Date().toISOString();
      await supabase.from('tenant_theme').update(theme).eq('tenant_id', tenantId);
    }
  }

  // ── Categories + products ───────────────────────────────────────────────
  const { catList, prodList } = await loadExisting(supabase, tenantId, branchId);
  const catIdByName = new Map(catList.map((c) => [norm(c.name), c.id]));
  let nextCatPos = Math.max(-1, ...catList.map((c) => c.position)) + 1;

  const prodByKey = new Map(prodList.map((p) => [`${p.category_id}|${norm(p.name)}`, p]));
  const maxPos = new Map<string, number>();
  for (const p of prodList) maxPos.set(p.category_id, Math.max(maxPos.get(p.category_id) ?? -1, p.position));

  const seenCatIds = new Set<string>();
  const seenProdIds = new Set<string>();

  for (const c of payload.categories) {
    const cn = norm(c.name);
    if (!cn) continue;
    let catId = catIdByName.get(cn);
    if (!catId) {
      const { data } = await supabase
        .from('categories')
        .insert({ tenant_id: tenantId, branch_id: branchId, name: c.name.trim(), icon: c.icon ?? null, position: nextCatPos++ })
        .select('id')
        .single<{ id: string }>();
      if (!data) continue;
      catId = data.id;
      catIdByName.set(cn, catId);
    } else if (c.icon != null) {
      await supabase.from('categories').update({ icon: c.icon }).eq('id', catId);
    }
    seenCatIds.add(catId);

    for (const p of c.products) {
      if (!norm(p.name)) continue;
      const fields = await buildProductFields(supabase, tenantId, p);
      const ex = prodByKey.get(`${catId}|${norm(p.name)}`);
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
  }

  if (deleteMissing) {
    const missingProdIds = prodList.filter((p) => !seenProdIds.has(p.id)).map((p) => p.id);
    if (missingProdIds.length) await supabase.from('products').delete().in('id', missingProdIds);
    const missingCatIds = catList.filter((c) => !seenCatIds.has(c.id)).map((c) => c.id);
    if (missingCatIds.length) await supabase.from('categories').delete().in('id', missingCatIds);
  }

  revalidatePath('/menu');
  revalidatePath('/design');
  revalidatePath(`/s/${subdomain}`);
}

async function buildProductFields(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  p: ImportProduct,
) {
  const image_url = await resolveImage(supabase, tenantId, p.image);
  return {
    name: p.name.trim(),
    description: p.description?.trim() || null,
    price: p.price ?? null,
    compare_at_price: p.compareAtPrice ?? null,
    prep_time: p.prepTime ?? null,
    calories: p.calories ?? null,
    is_available: p.available ?? true,
    tags: p.tags ?? [],
    variants: (p.variants ?? []).filter((v) => v.name).map((v) => ({ name: v.name, price: v.price ?? 0 })),
    modifiers: (p.modifiers ?? []).filter((v) => v.name).map((v) => ({ name: v.name, price: v.price ?? 0 })),
    removables: (p.removables ?? []).filter(Boolean),
    ...(image_url ? { image_url } : {}),
  };
}
