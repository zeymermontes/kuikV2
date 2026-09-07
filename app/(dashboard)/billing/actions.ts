'use server';

import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { cancelPreapproval, createSubscription } from '@/lib/mercadopago';
import { getPlatformSettings } from '@/lib/platform';
import { isAddon, type Addon } from '@/lib/plan';

/**
 * Starts the MercadoPago subscription flow for a tier plus add-ons and
 * redirects to checkout. A change of tier or add-ons is a new preapproval; the
 * one in force is cancelled so the restaurant is never billed twice.
 */
export async function startSubscription(plan: 'basic' | 'pro', rawAddons: readonly string[] = []) {
  const { tenant, user, subscription } = await requireOwner();
  const additional = subscription.is_additional;
  const addons: Addon[] = [...new Set(rawAddons.filter(isAddon))];
  const settings = await getPlatformSettings();

  // Record the choice now; the webhook flips status to active on payment.
  const supabase = await createClient();
  await supabase.from('subscriptions').update({ plan, addons }).eq('tenant_id', tenant.id);
  // Every branch is a line of the same charge (lib/pricing.ts).
  const { count: branchCount } = await supabase.from('branches').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
  const branches = branchCount ?? 0;

  let initPoint: string | null = null;
  try {
    if (subscription.mp_preapproval_id && subscription.status === 'active') {
      await cancelPreapproval(subscription.mp_preapproval_id).catch((err) => console.error('[mercadopago] cancel old preapproval failed:', err));
    }
    const tierName = additional ? 'Adicional' : plan === 'pro' ? settings.pro_name : settings.plan_name;
    const result = await createSubscription({
      tenantId: tenant.id,
      payerEmail: user.email ?? '',
      reason: `Kuik ${tierName}${addons.includes('pos') ? ` + ${settings.pos_addon_name}` : ''}${branches > 0 ? ` + ${branches} sucursal${branches === 1 ? '' : 'es'}` : ''} — ${tenant.name}`,
      plan,
      addons,
      additional,
      branches,
    });
    initPoint = result.initPoint;
  } catch (err) {
    // Log the real MercadoPago message (e.g. invalid back_url, sandbox payer)
    // and send the user back to billing with an error flag instead of a 500.
    console.error('[mercadopago] createSubscription failed:', err);
  }

  // redirect() throws internally, so it must run outside the try/catch.
  redirect(initPoint ?? '/billing?error=mp');
}
