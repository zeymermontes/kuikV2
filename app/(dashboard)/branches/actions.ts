'use server';

import { revalidatePath } from 'next/cache';
import { revalidateTenant } from '@/lib/revalidate';
import { requireManager } from '@/lib/auth';
import { effectiveAddons, effectivePlan } from '@/lib/plan';
import { monthlyAmount } from '@/lib/pricing';
import { getPlatformSettings } from '@/lib/platform';
import { updatePreapprovalAmount } from '@/lib/mercadopago';
import { createAdminClient } from '@/lib/supabase/admin';
import { slugify } from '@/lib/utils';
import { createClient } from '@/lib/supabase/server';
import type { Category, Product, Separator, BranchMenuMode } from '@/lib/database.types';

/** Copy a source menu (main = null, or another branch) into a target branch. */
async function copyMenu(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
  targetBranchId: string,
  sourceBranchId: string | null,
) {
  let catQuery = supabase.from('categories').select('*').eq('tenant_id', tenantId);
  catQuery = sourceBranchId ? catQuery.eq('branch_id', sourceBranchId) : catQuery.is('branch_id', null);
  const { data: cats } = await catQuery.order('position');
  const categories = (cats ?? []) as Category[];
  if (categories.length === 0) return;

  const oldIds = categories.map((c) => c.id);
  const [{ data: prods }, { data: seps }] = await Promise.all([
    supabase.from('products').select('*').in('category_id', oldIds),
    supabase.from('separators').select('*').in('category_id', oldIds),
  ]);

  for (const c of categories) {
    const { data: newCat } = await supabase
      .from('categories')
      .insert({
        tenant_id: tenantId,
        branch_id: targetBranchId,
        name: c.name,
        position: c.position,
        icon: c.icon,
        icon_image_url: c.icon_image_url,
        banner_name: c.banner_name,
        banner_image_url: c.banner_image_url,
        is_visible: c.is_visible,
      })
      .select('id')
      .single<{ id: string }>();
    if (!newCat) continue;

    const prodRows = ((prods ?? []) as Product[])
      .filter((p) => p.category_id === c.id)
      .map((p) => ({
        tenant_id: tenantId,
        category_id: newCat.id,
        name: p.name,
        description: p.description,
        price: p.price,
        compare_at_price: p.compare_at_price,
        prep_time: p.prep_time,
        calories: p.calories,
        show_price: p.show_price,
        image_url: p.image_url,
        is_available: p.is_available,
        position: p.position,
        tags: p.tags,
        variants: p.variants,
        modifiers: p.modifiers,
        removables: p.removables,
      }));
    if (prodRows.length) await supabase.from('products').insert(prodRows);

    const sepRows = ((seps ?? []) as Separator[])
      .filter((s) => s.category_id === c.id)
      .map((s) => ({
        tenant_id: tenantId,
        category_id: newCat.id,
        label: s.label,
        style: s.style,
        position: s.position,
      }));
    if (sepRows.length) await supabase.from('separators').insert(sepRows);
  }
}

export async function createBranch(input: {
  name: string;
  whatsapp: string;
  address: string;
  menuMode: BranchMenuMode;
  copyFrom: string; // 'none' | 'main' | <branchId>
}) {
  const { tenant, subscription } = await requireManager();
  // Any tier may add branches; each is a paid line (lib/pricing.ts). A lapsed
  // subscription first has to be put in order on the billing page.
  if (!['active', 'trialing'].includes(subscription.status) || !input.name.trim()) return;
  const supabase = await createClient();

  // Ensure a unique slug within the tenant.
  let slug = slugify(input.name, 'sucursal');
  const { data: existing } = await supabase
    .from('branches')
    .select('slug')
    .eq('tenant_id', tenant.id)
    .like('slug', `${slug}%`);
  if ((existing ?? []).some((b) => b.slug === slug)) slug = `${slug}-${(existing ?? []).length + 1}`;

  const { count } = await supabase
    .from('branches')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id);

  const { data: branch } = await supabase
    .from('branches')
    .insert({
      tenant_id: tenant.id,
      name: input.name.trim(),
      slug,
      whatsapp_phone: input.whatsapp.replace(/\D/g, '') || null,
      address: input.address.trim() || null,
      menu_mode: input.menuMode,
      position: count ?? 0,
    })
    .select('id')
    .single<{ id: string }>();

  if (branch && input.menuMode === 'independent' && input.copyFrom !== 'none') {
    await copyMenu(supabase, tenant.id, branch.id, input.copyFrom === 'main' ? null : input.copyFrom);
  }

  revalidatePath('/branches');
  revalidatePath('/menu');
  revalidateTenant(tenant.subdomain, tenant.custom_domain);
  await syncBranchCharge(tenant.id);
}

/**
 * A branch added or removed changes what the restaurant pays: recompute the
 * monthly amount and update the preapproval in force. Nothing to do on a
 * trial (no charge yet) or before the first payment (the checkout the owner
 * starts from the billing page counts the branches itself).
 */
async function syncBranchCharge(tenantId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: sub } = await admin
    .from('subscriptions')
    .select('status, plan, addons, is_additional, mp_preapproval_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!sub || sub.status !== 'active' || !sub.mp_preapproval_id) return;
  const { count } = await admin.from('branches').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId);
  const settings = await getPlatformSettings();
  const amount = monthlyAmount(settings, {
    plan: effectivePlan(sub),
    addons: effectiveAddons(sub),
    additional: !!sub.is_additional,
    branches: count ?? 0,
  });
  try {
    await updatePreapprovalAmount(sub.mp_preapproval_id, amount);
  } catch (err) {
    // The next tier change re-creates the preapproval with the right amount;
    // meanwhile the restaurant is charged the old one, never more.
    console.error('[mercadopago] update preapproval amount failed:', err);
  }
}

export async function updateBranch(
  id: string,
  fields: Partial<{
    name: string;
    whatsapp_phone: string | null;
    address: string | null;
    maps_url: string | null;
    hours: unknown;
    menu_mode: BranchMenuMode;
    is_visible: boolean;
  }>,
) {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('branches').update(fields).eq('id', id).eq('tenant_id', tenant.id);
  revalidatePath('/branches');
  revalidatePath('/menu');
  revalidateTenant(tenant.subdomain, tenant.custom_domain);
}

export async function deleteBranch(id: string) {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('branches').delete().eq('id', id).eq('tenant_id', tenant.id);
  revalidatePath('/branches');
  revalidatePath('/menu');
  revalidateTenant(tenant.subdomain, tenant.custom_domain);
  await syncBranchCharge(tenant.id);
}
