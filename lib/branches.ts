import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Branch } from '@/lib/database.types';

/**
 * The branch an operations page was opened for (`?branch=<id or slug>`), or
 * null for the main location. A value that matches no branch of the tenant
 * is treated as none rather than as an error: a stale bookmark should open
 * the main location, not a blank screen.
 */
export async function resolveBranch(supabase: SupabaseClient, tenantId: string, param: string | undefined | null): Promise<Branch | null> {
  const key = (param ?? '').trim();
  if (!key) return null;
  const isId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  const { data } = await supabase
    .from('branches')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq(isId ? 'id' : 'slug', key)
    .maybeSingle<Branch>();
  return data ?? null;
}

/** For a query on a branch-scoped table: this branch's rows, or the main location's (branch_id null). */
export function branchFilter<Q>(q: Q, branchId: string | null): Q {
  // Structural cast rather than a generic constraint: the query builder's own
  // generics make the constrained form blow up type instantiation.
  const b = q as unknown as { eq: (c: string, v: string) => Q; is: (c: string, v: null) => Q };
  return branchId ? b.eq('branch_id', branchId) : b.is('branch_id', null);
}
