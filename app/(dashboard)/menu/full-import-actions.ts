'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { IMPORT_DESIGN_KEYS, type FullImportPayload, type ImportPreview, type ImportProduct,
  type ImportCategory,
} from '@/lib/menu-import';

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
    supabase.from('categories').select('id, name, position, icon, parent_id').eq('tenant_id', tenantId),
    branchId,
  );
  const catList = (cats ?? []) as {
    id: string;
    name: string;
    position: number;
    icon: string | null;
    parent_id: string | null;
  }[];
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

  // A category is identified by parent + name, so two parents may each have
  // their own "Extras" without colliding.
  const key = (parentId: string | null, name: string) => `${parentId ?? ''}|${norm(name)}`;
  const catIdByKey = new Map(catList.map((c) => [key(c.parent_id, c.name), c.id]));
  const prodByKey = new Map(prodList.map((p) => [`${p.category_id}|${norm(p.name)}`, p]));

  const fileCatKeys = new Set<string>();
  for (const c of payload.categories) {
    fileCatKeys.add(key(null, c.name));
    const parentId = catIdByKey.get(key(null, c.name)) ?? null;
    for (const sub of c.subcategories ?? []) fileCatKeys.add(key(parentId, sub.name));
  }

  let newCategories = 0;
  for (const k of fileCatKeys) if (!catIdByKey.has(k)) newCategories++;

  const seen = new Set<string>();
  let newProducts = 0;
  let updatedProducts = 0;
  const countProducts = (catId: string | undefined, cat: (typeof payload.categories)[number]) => {
    for (const p of cat.products) {
      if (!norm(p.name)) continue;
      const ex = catId ? prodByKey.get(`${catId}|${norm(p.name)}`) : undefined;
      if (ex) {
        updatedProducts++;
        seen.add(ex.id);
      } else {
        newProducts++;
      }
    }
  };
  for (const c of payload.categories) {
    const catId = catIdByKey.get(key(null, c.name));
    countProducts(catId, c);
    for (const sub of c.subcategories ?? []) {
      countProducts(catIdByKey.get(key(catId ?? null, sub.name)), sub);
    }
  }

  return {
    newCategories,
    newProducts,
    updatedProducts,
    missingProducts: prodList.filter((p) => !seen.has(p.id)).length,
    missingCategories: catList.filter((c) => !fileCatKeys.has(key(c.parent_id, c.name))).length,
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
  // Identified by parent + name, so sibling lists are independent.
  const key = (parentId: string | null, name: string) => `${parentId ?? ''}|${norm(name)}`;
  const catIdByKey = new Map(catList.map((c) => [key(c.parent_id, c.name), c.id]));
  let nextCatPos = Math.max(-1, ...catList.filter((c) => !c.parent_id).map((c) => c.position)) + 1;
  const nextSubPos = new Map<string, number>();
  for (const c of catList) {
    if (c.parent_id) {
      nextSubPos.set(c.parent_id, Math.max(nextSubPos.get(c.parent_id) ?? -1, c.position) + 1);
    }
  }

  const prodByKey = new Map(prodList.map((p) => [`${p.category_id}|${norm(p.name)}`, p]));
  const maxPos = new Map<string, number>();
  for (const p of prodList) maxPos.set(p.category_id, Math.max(maxPos.get(p.category_id) ?? -1, p.position));

  const seenCatIds = new Set<string>();
  const seenProdIds = new Set<string>();

  /** Find or create one category (top level when parentId is null). */
  async function upsertCategory(
    cat: ImportCategory,
    parentId: string | null,
  ): Promise<string | null> {
    const cn = norm(cat.name);
    if (!cn) return null;
    const iconImage = await resolveImage(supabase, tenantId, cat.image);
    let id = catIdByKey.get(key(parentId, cat.name));
    if (!id) {
      const position = parentId ? (nextSubPos.get(parentId) ?? 0) : nextCatPos++;
      if (parentId) nextSubPos.set(parentId, position + 1);
      const { data } = await supabase
        .from('categories')
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          parent_id: parentId,
          name: cat.name.trim(),
          icon: cat.icon ?? null,
          icon_image_url: iconImage ?? null,
          position,
        })
        .select('id')
        .single<{ id: string }>();
      if (!data) return null;
      id = data.id;
      catIdByKey.set(key(parentId, cat.name), id);
    } else {
      const patch: Record<string, unknown> = {};
      if (cat.icon != null) patch.icon = cat.icon;
      if (iconImage) patch.icon_image_url = iconImage;
      if (Object.keys(patch).length) await supabase.from('categories').update(patch).eq('id', id);
    }
    seenCatIds.add(id);
    return id;
  }

  /** Create/update every product of one category. */
  async function upsertProducts(catId: string, cat: ImportCategory) {
    for (const p of cat.products) {
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

  for (const c of payload.categories) {
    const catId = await upsertCategory(c, null);
    if (!catId) continue;
    await upsertProducts(catId, c);
    // One level only: a subcategory's own `subcategories` are ignored.
    for (const sub of c.subcategories ?? []) {
      const subId = await upsertCategory(sub, catId);
      if (subId) await upsertProducts(subId, sub);
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
  const optionGroups = (p.optionGroups ?? [])
    .filter((g) => g.name && (g.options ?? []).length > 0)
    .map((g) => ({
      id: crypto.randomUUID(),
      name: g.name.trim(),
      description: g.description?.trim() || undefined,
      kind: g.kind === 'takeaway' ? ('takeaway' as const) : ('dish' as const),
      required: g.required ?? false,
      multiple: g.multiple ?? true,
      options: (g.options ?? []).filter((o) => o.name).map((o) => ({ name: o.name, price: o.price ?? 0 })),
    }));
  return {
    name: p.name.trim(),
    description: p.description?.trim() || null,
    price: p.price ?? null,
    compare_at_price: p.compareAtPrice ?? null,
    cost: p.cost ?? null,
    prep_time: p.prepTime ?? null,
    calories: p.calories ?? null,
    is_available: p.available ?? true,
    is_hidden: p.hidden ?? false,
    tags: p.tags ?? [],
    option_groups: optionGroups,
    variants: (p.variants ?? []).filter((v) => v.name).map((v) => ({ name: v.name, price: v.price ?? 0 })),
    modifiers: (p.modifiers ?? []).filter((v) => v.name).map((v) => ({ name: v.name, price: v.price ?? 0 })),
    removables: (p.removables ?? []).filter(Boolean),
    ...(image_url ? { image_url } : {}),
  };
}
