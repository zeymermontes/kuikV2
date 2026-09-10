'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { registerSlug } from '@/lib/pos/customer-screen';
import type { RegisterShift } from '@/lib/pos/types';

// The registers seen from the office: which are open right now, what they
// have taken, and the two things a manager may need to do from afar: open a
// register before the cashier arrives, and close one a cashier forgot. The
// rows are the same register_shifts the terminals sync (lib/pos/sync.ts),
// so a change here reaches the tablet over Realtime within a second.

export interface ShiftTotals {
  cash: number;
  card: number;
  other: number;
  tips: number;
  payments: number;
}

export interface ShiftView extends RegisterShift {
  totals: ShiftTotals;
  opened_by_name: string | null;
  closed_by_name: string | null;
}

async function totalsFor(supabase: Awaited<ReturnType<typeof createClient>>, shiftIds: string[]): Promise<Map<string, ShiftTotals>> {
  const out = new Map<string, ShiftTotals>();
  if (shiftIds.length === 0) return out;
  const { data } = await supabase.from('payments').select('shift_id, method, amount, tip').in('shift_id', shiftIds);
  for (const p of (data ?? []) as { shift_id: string; method: string; amount: number; tip: number | null }[]) {
    const t = out.get(p.shift_id) ?? { cash: 0, card: 0, other: 0, tips: 0, payments: 0 };
    if (p.method === 'cash') t.cash += p.amount;
    else if (p.method === 'card') t.card += p.amount;
    else t.other += p.amount;
    t.tips += p.tip ?? 0;
    t.payments += 1;
    out.set(p.shift_id, t);
  }
  return out;
}

/** Open shifts first, then the last closed ones. */
export async function listShifts(): Promise<ShiftView[]> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const [{ data: open }, { data: closed }] = await Promise.all([
    supabase.from('register_shifts').select('*').eq('tenant_id', tenant.id).eq('status', 'open').order('opened_at', { ascending: false }),
    supabase.from('register_shifts').select('*').eq('tenant_id', tenant.id).eq('status', 'closed').order('closed_at', { ascending: false }).limit(20),
  ]);
  const rows = [...((open ?? []) as RegisterShift[]), ...((closed ?? []) as RegisterShift[])];
  const totals = await totalsFor(supabase, rows.map((r) => r.id));
  const userIds = [...new Set(rows.flatMap((r) => [r.opened_by, r.closed_by]).filter((x): x is string => !!x))];
  const { data: people } = userIds.length ? await supabase.from('profiles').select('id, full_name').in('id', userIds) : { data: [] };
  const nameOf = new Map(((people ?? []) as { id: string; full_name: string | null }[]).map((p) => [p.id, p.full_name]));
  return rows.map((r) => ({
    ...r,
    totals: totals.get(r.id) ?? { cash: 0, card: 0, other: 0, tips: 0, payments: 0 },
    opened_by_name: r.opened_by ? (nameOf.get(r.opened_by) ?? null) : null,
    closed_by_name: r.closed_by ? (nameOf.get(r.closed_by) ?? null) : null,
  }));
}

/** Open a register from the office. Refused while that register already has an open shift at that location. */
export async function openShiftRemote(input: { register: string; branchId: string | null; openingCash: number }): Promise<{ error?: 'already_open' | 'invalid' }> {
  const { tenant, user } = await requireManager();
  const register = registerSlug(input.register);
  const openingCash = Number(input.openingCash);
  if (!register || !Number.isFinite(openingCash) || openingCash < 0) return { error: 'invalid' };
  const supabase = await createClient();
  let q = supabase.from('register_shifts').select('id').eq('tenant_id', tenant.id).eq('status', 'open').eq('register', register);
  q = input.branchId ? q.eq('branch_id', input.branchId) : q.is('branch_id', null);
  const { data: existing } = await q.maybeSingle();
  if (existing) return { error: 'already_open' };
  const now = new Date().toISOString();
  await supabase.from('register_shifts').insert({
    id: crypto.randomUUID(),
    tenant_id: tenant.id,
    branch_id: input.branchId,
    register,
    opened_by: user.id,
    opened_at: now,
    opening_cash: openingCash,
    status: 'open',
    created_at: now,
    updated_at: now,
  });
  revalidatePath('/registers');
  return {};
}

/**
 * Close a shift from the office. Without a counted amount the drawer is
 * assumed to hold what it should (opening float plus cash taken), so the
 * over/short is zero and the cashier's count can be recorded later by hand.
 */
export async function closeShiftRemote(shiftId: string, countedCash?: number | null): Promise<{ error?: 'not_open' }> {
  const { tenant, user } = await requireManager();
  const supabase = await createClient();
  const { data } = await supabase.from('register_shifts').select('*').eq('id', shiftId).eq('tenant_id', tenant.id).eq('status', 'open').maybeSingle();
  const shift = data as RegisterShift | null;
  if (!shift) return { error: 'not_open' };
  const totals = (await totalsFor(supabase, [shift.id])).get(shift.id);
  const expected = shift.opening_cash + (totals?.cash ?? 0);
  const counted = countedCash != null && Number.isFinite(countedCash) ? countedCash : expected;
  await supabase
    .from('register_shifts')
    .update({
      status: 'closed',
      closed_by: user.id,
      closed_at: new Date().toISOString(),
      closing_cash: counted,
      expected_cash: expected,
      over_short: counted - expected,
      updated_at: new Date().toISOString(),
    })
    .eq('id', shift.id)
    .eq('tenant_id', tenant.id);
  revalidatePath('/registers');
  return {};
}
