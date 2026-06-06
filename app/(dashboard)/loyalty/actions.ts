'use server';

import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { LoyaltyCustomer, LoyaltyProgram } from '@/lib/database.types';

async function ctx() {
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  return { tenantId: tenant.id, supabase };
}

/** Look up a member by their code or phone (staff accreditation). */
export async function findCustomer(query: string): Promise<LoyaltyCustomer | null> {
  const { tenantId, supabase } = await ctx();
  const q = query.trim();
  if (!q) return null;
  const code = q.toUpperCase();
  const phone = q.replace(/\D/g, '');

  const { data } = await supabase
    .from('loyalty_customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .or(`code.eq.${code}${phone.length >= 8 ? `,phone.eq.${phone}` : ''}`)
    .limit(1)
    .maybeSingle<LoyaltyCustomer>();
  return data ?? null;
}

async function getProgram(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tenantId: string,
): Promise<LoyaltyProgram | null> {
  const { data } = await supabase
    .from('loyalty_program')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle<LoyaltyProgram>();
  return data;
}

/** Award N stamps (default 1) and count a visit. */
export async function awardStamps(customerId: string, n = 1): Promise<LoyaltyCustomer | null> {
  const { tenantId, supabase } = await ctx();
  const { data: c } = await supabase
    .from('loyalty_customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', customerId)
    .maybeSingle<LoyaltyCustomer>();
  if (!c) return null;

  const { data: updated } = await supabase
    .from('loyalty_customers')
    .update({ stamps: c.stamps + n, total_visits: c.total_visits + 1 })
    .eq('id', customerId)
    .select('*')
    .maybeSingle<LoyaltyCustomer>();

  await supabase.from('loyalty_events').insert({
    tenant_id: tenantId,
    customer_id: customerId,
    kind: 'earn',
    stamps_delta: n,
  });
  return updated ?? null;
}

/** Award points for a sale amount (points = amount × points_per_currency). */
export async function awardPoints(customerId: string, amount: number): Promise<LoyaltyCustomer | null> {
  const { tenantId, supabase } = await ctx();
  if (!(amount > 0)) return null;
  const program = await getProgram(supabase, tenantId);
  const earned = Math.round(amount * (program?.points_per_currency ?? 1) * 100) / 100;

  const { data: c } = await supabase
    .from('loyalty_customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', customerId)
    .maybeSingle<LoyaltyCustomer>();
  if (!c) return null;

  const { data: updated } = await supabase
    .from('loyalty_customers')
    .update({ points: Number(c.points) + earned, total_visits: c.total_visits + 1 })
    .eq('id', customerId)
    .select('*')
    .maybeSingle<LoyaltyCustomer>();

  await supabase.from('loyalty_events').insert({
    tenant_id: tenantId,
    customer_id: customerId,
    kind: 'earn',
    points_delta: earned,
    amount,
  });
  return updated ?? null;
}

/** Redeem a reward: reset stamps (stamps mode) or subtract points (points mode). */
export async function redeem(customerId: string): Promise<LoyaltyCustomer | null> {
  const { tenantId, supabase } = await ctx();
  const program = await getProgram(supabase, tenantId);
  if (!program) return null;

  const { data: c } = await supabase
    .from('loyalty_customers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', customerId)
    .maybeSingle<LoyaltyCustomer>();
  if (!c) return null;

  let patch: Partial<LoyaltyCustomer>;
  let event: { stamps_delta?: number; points_delta?: number };

  if (program.type === 'stamps') {
    if (c.stamps < program.stamps_needed) return c; // not enough yet
    patch = { stamps: c.stamps - program.stamps_needed };
    event = { stamps_delta: -program.stamps_needed };
  } else {
    const cost = program.points_for_reward ?? 0;
    if (cost <= 0 || Number(c.points) < cost) return c;
    patch = { points: Number(c.points) - cost };
    event = { points_delta: -cost };
  }

  const { data: updated } = await supabase
    .from('loyalty_customers')
    .update(patch)
    .eq('id', customerId)
    .select('*')
    .maybeSingle<LoyaltyCustomer>();

  await supabase.from('loyalty_events').insert({
    tenant_id: tenantId,
    customer_id: customerId,
    kind: 'redeem',
    ...event,
  });
  return updated ?? null;
}
