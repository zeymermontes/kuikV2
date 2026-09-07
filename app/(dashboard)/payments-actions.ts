'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { APP_URL } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  configuredProviders,
  getGateway,
  getPaymentAccount,
  isPaymentProvider,
  publicAccount,
  refreshAccount,
  type PaymentProvider,
  type PublicPaymentAccount,
} from '@/lib/payments';
import { verifyCredentials } from '@/lib/payments/clip';

// Connecting a gateway is a manager's job. The rows in payment_accounts are
// written here with the service role (the browser only reads the flags), and
// the gateway's hosted onboarding does the rest.

export async function paymentAccountState(): Promise<{ providers: PaymentProvider[]; account: PublicPaymentAccount | null }> {
  const { tenant } = await requireManager();
  return { providers: configuredProviders(), account: publicAccount(await getPaymentAccount(tenant.id)) };
}

/** Start (or resume) onboarding on one gateway and send the manager there. */
export async function connectGateway(provider: PaymentProvider): Promise<void> {
  const { tenant, user } = await requireManager();
  if (!isPaymentProvider(provider) || !configuredProviders().includes(provider)) throw new Error('payments_not_configured');
  if (provider === 'clip') throw new Error('clip_uses_credentials'); // connectClip below
  const existing = await getPaymentAccount(tenant.id);
  // One gateway per restaurant: switching means disconnecting first.
  if (existing && existing.provider !== provider) throw new Error('other_gateway_connected');
  const tag = provider === 'stripe' ? 'stripe' : 'mp';
  const { accountId, url } = await getGateway(provider).connect({
    tenantId: tenant.id,
    existingAccountId: existing?.account_id ?? null,
    email: user.email ?? null,
    displayName: tenant.name,
    returnUrl: `${APP_URL}/ordering?${tag}=return`,
    refreshUrl: `${APP_URL}/ordering?${tag}=refresh`,
  });
  // OAuth gateways reveal the account only at the callback, which writes the row.
  if (!existing && accountId) {
    await createAdminClient().from('payment_accounts').insert({ tenant_id: tenant.id, provider, account_id: accountId });
  }
  redirect(url);
}

/**
 * Clip has no hosted onboarding: the manager pastes the API key and secret
 * of an application created on dashboard.clip.mx. The pair is checked
 * against Clip before it is stored, and it never reaches the browser again.
 */
export async function connectClip(input: { apiKey: string; secret: string }): Promise<{ account?: PublicPaymentAccount | null; error?: 'invalid' | 'other_gateway' | 'not_offered' }> {
  const { tenant } = await requireManager();
  if (!configuredProviders().includes('clip')) return { error: 'not_offered' };
  const apiKey = input.apiKey.trim();
  const secret = input.secret.trim();
  if (!apiKey || !secret || !(await verifyCredentials({ api_key: apiKey, secret }))) return { error: 'invalid' };
  const existing = await getPaymentAccount(tenant.id);
  if (existing && existing.provider !== 'clip') return { error: 'other_gateway' };
  const now = new Date().toISOString();
  const row = {
    tenant_id: tenant.id,
    provider: 'clip' as const,
    account_id: apiKey,
    credentials: { api_key: apiKey, secret },
    charges_enabled: true,
    details_submitted: true,
    updated_at: now,
  };
  const supabase = createAdminClient();
  const { error } = existing
    ? await supabase.from('payment_accounts').update(row).eq('tenant_id', tenant.id)
    : await supabase.from('payment_accounts').insert(row);
  if (error) throw new Error(error.message);
  revalidatePath('/ordering');
  return { account: publicAccount(await getPaymentAccount(tenant.id)) };
}

/** Kept for existing callers. */
export async function connectStripe(): Promise<void> {
  return connectGateway('stripe');
}

/** Back from onboarding: pull the flags the gateway now has for the account. */
export async function syncPaymentAccount(): Promise<PublicPaymentAccount | null> {
  const { tenant } = await requireManager();
  const account = await getPaymentAccount(tenant.id);
  if (!account) return null;
  const next = await refreshAccount(account);
  revalidatePath('/ordering');
  return publicAccount(next);
}

/** Forget the connection. The gateway account itself stays with the restaurant. */
export async function disconnectGateway(): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = createAdminClient();
  await supabase.from('payment_accounts').delete().eq('tenant_id', tenant.id);
  // The cart must stop offering it at once.
  const { data } = await supabase.from('tenant_ordering').select('payment_methods').eq('tenant_id', tenant.id).maybeSingle();
  const methods = ((data as { payment_methods: string[] } | null)?.payment_methods ?? []).filter((m) => m !== 'online');
  await supabase.from('tenant_ordering').update({ payment_methods: methods }).eq('tenant_id', tenant.id);
  revalidatePath('/ordering');
}
