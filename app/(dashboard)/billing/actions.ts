'use server';

import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createSubscription } from '@/lib/mercadopago';

/** Starts the MercadoPago subscription flow for a plan and redirects to checkout. */
export async function startSubscription(plan: 'basic' | 'pro') {
  const { tenant, user } = await requireOwner();

  // Record the chosen tier now; the webhook flips status to active on payment.
  const supabase = await createClient();
  await supabase.from('subscriptions').update({ plan }).eq('tenant_id', tenant.id);

  let initPoint: string | null = null;
  try {
    const result = await createSubscription({
      tenantId: tenant.id,
      payerEmail: user.email ?? '',
      reason: `Kuik ${plan === 'pro' ? 'Pro' : 'Básico'} — ${tenant.name}`,
      plan,
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
