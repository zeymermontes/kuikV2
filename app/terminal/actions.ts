'use server';

import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_REGISTER } from '@/lib/pos/customer-screen';
import type { HubRegister } from '@/components/pos/TerminalHub';

/**
 * The registers this restaurant has run, per branch: every shift names the
 * register that opened it (0071) and its branch (0082). Recent first, so a
 * register renamed months ago drops off. The hub renders the list on the
 * server and asks again when the customer-screen panel opens, so a register
 * that opened its first shift a minute ago is already there.
 */
export async function listRegisters(): Promise<HubRegister[]> {
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  const { data } = await supabase.from('register_shifts').select('register, branch_id').eq('tenant_id', tenant.id).order('opened_at', { ascending: false }).limit(400);
  const seen = new Set<string>();
  const out: HubRegister[] = [];
  for (const r of (data ?? []) as { register: string | null; branch_id: string | null }[]) {
    const register = r.register ?? DEFAULT_REGISTER;
    const key = `${r.branch_id ?? ''}:${register}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ branchId: r.branch_id ?? null, register });
  }
  return out;
}
