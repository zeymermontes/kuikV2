import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Delete what the `media` bucket holds and nothing points at any more: the
 * photo replaced from the dashboard, the menu imported twice, the logo that
 * was tried and swapped. Nothing ever removed them, so the bucket only grew.
 *
 * Referenced = every media path found in the text of any row of any public
 * table (media_referenced_paths(), migration 0081). Kept regardless: the
 * landing/ folder (deployed and cleaned by the super admin's own action) and
 * anything uploaded in the last day, so a file whose row is still being
 * saved is never swept from under it.
 */

export interface SweepReport {
  tenants: number;
  objects: number;
  referenced: number;
  /** Paths that would be (dry run) or were deleted. */
  orphans: string[];
  bytes: number;
  dryRun: boolean;
}

type Admin = ReturnType<typeof createAdminClient>;
const GRACE_MS = 24 * 60 * 60 * 1000;
const BATCH = 100;

interface Obj {
  path: string;
  size: number;
  createdAt: number;
}

async function listAll(supabase: SupabaseClient, prefix: string): Promise<Obj[]> {
  const out: Obj[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from('media').list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${prefix}: ${error.message}`);
    for (const item of data ?? []) {
      const full = `${prefix}/${item.name}`;
      // Storage returns folders as entries with a null id; recurse into them.
      if (item.id === null) out.push(...(await listAll(supabase, full)));
      else {
        const meta = (item.metadata ?? {}) as { size?: number };
        out.push({ path: full, size: Number(meta.size ?? 0), createdAt: Date.parse(item.created_at ?? '') || 0 });
      }
    }
    if (!data || data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

/** Referenced paths, raw and URL-decoded: a name with a space is stored encoded in the URL. */
async function referencedPaths(supabase: Admin): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('media_referenced_paths');
  if (error) throw new Error(`media_referenced_paths: ${error.message}`);
  const set = new Set<string>();
  for (const p of (data ?? []) as string[]) {
    set.add(p);
    try {
      set.add(decodeURIComponent(p));
    } catch {
      // not encoded; the raw form is already in
    }
  }
  return set;
}

/** Sweep every tenant's folder. `dryRun` reports without deleting. */
export async function sweepMedia(opts: { dryRun?: boolean; tenantId?: string } = {}): Promise<SweepReport> {
  const supabase = createAdminClient();
  const dryRun = opts.dryRun ?? false;

  const { data: tenants, error } = opts.tenantId
    ? await supabase.from('tenants').select('id').eq('id', opts.tenantId)
    : await supabase.from('tenants').select('id');
  if (error) throw new Error(error.message);

  const referenced = await referencedPaths(supabase);
  const now = Date.now();
  const orphans: Obj[] = [];
  let objects = 0;

  for (const t of (tenants ?? []) as { id: string }[]) {
    const all = await listAll(supabase, t.id);
    objects += all.length;
    for (const o of all) {
      if (o.path.startsWith(`${t.id}/landing/`)) continue;
      if (now - o.createdAt < GRACE_MS) continue;
      if (referenced.has(o.path)) continue;
      orphans.push(o);
    }
  }

  if (!dryRun) {
    for (let i = 0; i < orphans.length; i += BATCH) {
      const chunk = orphans.slice(i, i + BATCH).map((o) => o.path);
      const { error: rmErr } = await supabase.storage.from('media').remove(chunk);
      if (rmErr) throw new Error(`remove: ${rmErr.message}`);
    }
  }

  return {
    tenants: tenants?.length ?? 0,
    objects,
    referenced: referenced.size,
    orphans: orphans.map((o) => o.path),
    bytes: orphans.reduce((n, o) => n + o.size, 0),
    dryRun,
  };
}
