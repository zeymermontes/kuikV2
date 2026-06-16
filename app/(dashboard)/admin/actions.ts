'use server';

import { revalidatePath } from 'next/cache';
import { unzipSync } from 'fflate';
import { requireSuperAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { contentTypeFor, LANDING_DIR } from '@/lib/landing';
import type { Subscription } from '@/lib/database.types';

/**
 * Grant N free months to a tenant. Extends the paid window from the later of
 * (now, current period end, trial end), marks the subscription active, and
 * records the action in the audit log.
 */
export async function awardFreeMonths(tenantId: string, months: number) {
  const actor = await requireSuperAdmin();
  if (months < 1 || months > 24) return;

  const supabase = createAdminClient();

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .single<Subscription>();
  if (!sub) return;

  const candidates = [
    Date.now(),
    sub.current_period_end ? Date.parse(sub.current_period_end) : 0,
    sub.trial_ends_at ? Date.parse(sub.trial_ends_at) : 0,
  ];
  const base = new Date(Math.max(...candidates));
  base.setMonth(base.getMonth() + months);

  await supabase
    .from('subscriptions')
    .update({
      status: 'active',
      current_period_end: base.toISOString(),
      free_months_granted: sub.free_months_granted + months,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);

  await supabase.from('audit_log').insert({
    actor_id: actor.id,
    tenant_id: tenantId,
    action: 'award_free_months',
    detail: { months, new_period_end: base.toISOString() },
  });

  revalidatePath('/admin');
}

/** Super-admin: update the platform subscription price/currency/plan name. */
export async function updatePricing(input: {
  amount: number;
  currency: string;
  planName: string;
  proAmount: number;
  proName: string;
  extraAmount: number;
}) {
  await requireSuperAdmin();
  if (!(input.amount > 0) || !input.currency) return;

  const supabase = createAdminClient();
  // upsert (not update) so the price persists even if the seed row is missing.
  await supabase.from('platform_settings').upsert(
    {
      id: 1,
      plan_amount: input.amount,
      plan_currency: input.currency.toUpperCase().slice(0, 3),
      plan_name: input.planName || 'Kuik Básico',
      pro_amount: input.proAmount,
      pro_name: input.proName || 'Kuik Pro',
      extra_amount: input.extraAmount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  revalidatePath('/admin');
  revalidatePath('/billing');
  revalidatePath('/');
}

// ─── Custom landing (bring-your-own-HTML) ───────────────────────────────────
// A super-admin uploads a self-contained static site as a .zip. We unpack it
// into media/<tenant>/landing-site/ and point the tenant's landing at index.html.
// The public page renders it inside a sandboxed iframe via the /api/landing
// proxy route (Supabase won't serve HTML as text/html — see lib/landing.ts).

/** Recursively list every object path under a storage prefix in the media bucket. */
async function listAllUnder(
  supabase: ReturnType<typeof createAdminClient>,
  prefix: string,
): Promise<string[]> {
  const { data } = await supabase.storage.from('media').list(prefix, { limit: 1000 });
  const paths: string[] = [];
  for (const item of data ?? []) {
    const full = `${prefix}/${item.name}`;
    // Storage returns folders as entries with a null id; recurse into them.
    if (item.id === null) {
      paths.push(...(await listAllUnder(supabase, full)));
    } else {
      paths.push(full);
    }
  }
  return paths;
}

/**
 * Super-admin: upload a tenant's custom landing site from a .zip.
 *
 * The zip must contain an index.html (at the root or inside a single wrapper
 * folder). Files are written to media/<tenant>/landing-site/ preserving their
 * relative paths, with the wrapper folder (if any) stripped so index.html lands
 * at the root. Any previous site under that folder is removed first.
 *
 * Returns { ok } or { error: <i18n key> }.
 */
export async function uploadCustomLanding(
  tenantId: string,
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const actor = await requireSuperAdmin();

  const file = formData.get('site');
  if (!(file instanceof File) || file.size === 0) return { error: 'noFile' };

  const bytes = new Uint8Array(await file.arrayBuffer());
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch {
    return { error: 'badZip' };
  }

  // Keep only real files: drop directory markers, macOS junk, and dotfiles.
  const entries = Object.entries(unzipped).filter(
    ([name, data]) =>
      !name.endsWith('/') &&
      data.length > 0 &&
      !name.startsWith('__MACOSX/') &&
      !name.split('/').some((seg) => seg === '..' || seg.startsWith('.')),
  );

  // Find the entry HTML, preferring the shallowest index.html.
  const indexEntry = entries
    .map(([name]) => name)
    .filter((name) => name.toLowerCase().endsWith('/index.html') || name.toLowerCase() === 'index.html')
    .sort((a, b) => a.split('/').length - b.split('/').length)[0];
  if (!indexEntry) return { error: 'noIndex' };

  // Strip the wrapper folder so index.html becomes the site root.
  const base = indexEntry.includes('/')
    ? indexEntry.slice(0, indexEntry.lastIndexOf('/') + 1)
    : '';
  const files = entries
    .filter(([name]) => name.startsWith(base))
    .map(([name, data]) => ({ rel: name.slice(base.length), data }))
    .filter((f) => f.rel.length > 0);

  const supabase = createAdminClient();
  const root = `${tenantId}/${LANDING_DIR}`;

  // Remove any previous deploy so stale assets don't linger.
  const stale = await listAllUnder(supabase, root);
  if (stale.length > 0) await supabase.storage.from('media').remove(stale);

  // Upload every file. upsert:true so re-deploys overwrite cleanly.
  // Pass the raw bytes (Buffer), NOT a Blob: supabase-js ignores the
  // `contentType` option for Blob bodies (sends multipart and defaults the
  // stored type to text/plain). With a Buffer it sets content-type explicitly,
  // so index.html is served as text/html and the browser renders it.
  for (const { rel, data } of files) {
    const ct = contentTypeFor(rel);
    const { error } = await supabase.storage
      .from('media')
      .upload(`${root}/${rel}`, Buffer.from(data), {
        contentType: ct,
        upsert: true,
        cacheControl: '3600',
      });
    if (error) return { error: 'uploadFailed' };
  }

  // Only store the files + entry path. Uploading does NOT change what the QR
  // shows — the super-admin selects the home mode separately (setLandingMode),
  // so a fresh upload never silently replaces the owner's template landing.
  const entryPath = `${root}/index.html`;
  await supabase.from('tenant_landing').upsert(
    {
      tenant_id: tenantId,
      custom_entry: entryPath,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  );

  await supabase.from('audit_log').insert({
    actor_id: actor.id,
    tenant_id: tenantId,
    action: 'upload_custom_landing',
    detail: { files: files.length, entry: entryPath },
  });

  revalidatePath('/admin');
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * Super-admin: choose what a tenant's home (QR target) shows.
 *   'builder' → defer to the owner's template landing (its `enabled` flag).
 *   'custom'  → the uploaded static site (rejected if none is uploaded).
 *   'none'    → force straight to the menu.
 */
export async function setLandingMode(
  tenantId: string,
  mode: 'builder' | 'custom' | 'none',
) {
  const actor = await requireSuperAdmin();
  const supabase = createAdminClient();

  if (mode === 'custom') {
    const { data } = await supabase
      .from('tenant_landing')
      .select('custom_entry')
      .eq('tenant_id', tenantId)
      .maybeSingle<{ custom_entry: string | null }>();
    if (!data?.custom_entry) return; // can't show a custom site that isn't there
  }

  await supabase
    .from('tenant_landing')
    .update({ landing_mode: mode, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId);

  await supabase.from('audit_log').insert({
    actor_id: actor.id,
    tenant_id: tenantId,
    action: 'set_landing_mode',
    detail: { mode },
  });

  revalidatePath('/admin');
  revalidatePath('/', 'layout');
}

/**
 * Super-admin: remove a tenant's custom landing and revert to the structured
 * builder. Deletes the uploaded files and clears landing_mode/custom_entry.
 */
export async function clearCustomLanding(tenantId: string) {
  const actor = await requireSuperAdmin();
  const supabase = createAdminClient();

  const stale = await listAllUnder(supabase, `${tenantId}/${LANDING_DIR}`);
  if (stale.length > 0) await supabase.storage.from('media').remove(stale);

  // Drop the files + entry. Only fall back to 'builder' if the home was
  // currently pointing at the (now-deleted) custom site; leave 'none' alone.
  const { data: cur } = await supabase
    .from('tenant_landing')
    .select('landing_mode')
    .eq('tenant_id', tenantId)
    .maybeSingle<{ landing_mode: 'builder' | 'custom' | 'none' }>();

  await supabase
    .from('tenant_landing')
    .update({
      custom_entry: null,
      ...(cur?.landing_mode === 'custom' ? { landing_mode: 'builder' as const } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);

  await supabase.from('audit_log').insert({
    actor_id: actor.id,
    tenant_id: tenantId,
    action: 'clear_custom_landing',
    detail: {},
  });

  revalidatePath('/admin');
  revalidatePath('/', 'layout');
}

/** Super-admin: override a tenant's plan tier. */
export async function setTenantPlan(tenantId: string, plan: 'basic' | 'pro') {
  const actor = await requireSuperAdmin();
  const supabase = createAdminClient();
  await supabase.from('subscriptions').update({ plan }).eq('tenant_id', tenantId);
  await supabase.from('audit_log').insert({
    actor_id: actor.id,
    tenant_id: tenantId,
    action: 'set_plan',
    detail: { plan },
  });
  revalidatePath('/admin');
  revalidatePath(`/s/`);
}
