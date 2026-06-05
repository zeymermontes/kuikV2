'use server';

import { redirect } from 'next/navigation';
import { requireTenant } from '@/lib/auth';
import { createSubscription } from '@/lib/mercadopago';

/** Starts the MercadoPago subscription flow and redirects to hosted checkout. */
export async function startSubscription() {
  const { tenant, user } = await requireTenant();

  let initPoint: string | null = null;
  try {
    const result = await createSubscription({
      tenantId: tenant.id,
      payerEmail: user.email ?? '',
      reason: `Kuik — ${tenant.name}`,
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
