'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
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
export async function updatePricing(
  amount: number,
  currency: string,
  planName: string,
) {
  await requireSuperAdmin();
  if (!(amount > 0) || !currency) return;

  const supabase = createAdminClient();
  // upsert (not update) so the price persists even if the seed row is missing.
  await supabase.from('platform_settings').upsert(
    {
      id: 1,
      plan_amount: amount,
      plan_currency: currency.toUpperCase().slice(0, 3),
      plan_name: planName || 'Kuik Pro',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );

  revalidatePath('/admin');
  revalidatePath('/billing');
  revalidatePath('/');
}
