'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { APP_URL } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';
import { getGateway, getPaymentAccount, paymentsConfigured, refreshAccount, type PaymentAccount } from '@/lib/payments';

// Connecting a gateway is a manager's job. The rows in payment_accounts are
// written here with the service role (the browser only reads them), and the
// gateway's hosted onboarding does the rest.

export async function paymentAccountState(): Promise<{ configured: boolean; account: PaymentAccount | null }> {
  const { tenant } = await requireManager();
  return { configured: paymentsConfigured(), account: await getPaymentAccount(tenant.id) };
}

/** Start (or resume) Stripe onboarding and send the manager there. */
export async function connectStripe(): Promise<void> {
  const { tenant, user } = await requireManager();
  if (!paymentsConfigured()) throw new Error('payments_not_configured');
  const existing = await getPaymentAccount(tenant.id);
  const { accountId, url } = await getGateway('stripe').connect({
    tenantId: tenant.id,
    existingAccountId: existing?.account_id ?? null,
    email: user.email ?? null,
    returnUrl: `${APP_URL}/ordering?stripe=return`,
    refreshUrl: `${APP_URL}/ordering?stripe=refresh`,
  });
  if (!existing) {
    await createAdminClient().from('payment_accounts').insert({ tenant_id: tenant.id, provider: 'stripe', account_id: accountId });
  }
  redirect(url);
}

/** Back from onboarding: pull the flags Stripe now has for the account. */
export async function syncStripeAccount(): Promise<PaymentAccount | null> {
  const { tenant } = await requireManager();
  const account = await getPaymentAccount(tenant.id);
  if (!account) return null;
  const next = await refreshAccount(account);
  revalidatePath('/ordering');
  return next;
}

/** Forget the connection. The Stripe account itself stays with the restaurant. */
export async function disconnectStripe(): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = createAdminClient();
  await supabase.from('payment_accounts').delete().eq('tenant_id', tenant.id);
  // The cart must stop offering it at once.
  const { data } = await supabase.from('tenant_ordering').select('payment_methods').eq('tenant_id', tenant.id).maybeSingle();
  const methods = ((data as { payment_methods: string[] } | null)?.payment_methods ?? []).filter((m) => m !== 'online');
  await supabase.from('tenant_ordering').update({ payment_methods: methods }).eq('tenant_id', tenant.id);
  revalidatePath('/ordering');
}
