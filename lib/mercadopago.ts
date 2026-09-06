import 'server-only';
import { MercadoPagoConfig, PreApproval } from 'mercadopago';
import { APP_URL } from '@/lib/config';
import { getPlatformSettings } from '@/lib/platform';
import type { Addon } from '@/lib/plan';

function mpClient() {
  return new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN!,
    options: {
      // Partner attribution: sent as x-integrator-id on every API call.
      // Optional — the client works the same without it.
      integratorId: process.env.MP_INTEGRATOR_ID,
    },
  });
}

/**
 * MercadoPago requires a public HTTPS back_url — http://localhost is rejected
 * ("Invalid value for back_url, must be a valid URL"). Order of preference:
 *   1. MERCADOPAGO_BACK_URL (set this to an ngrok/https URL for local testing)
 *   2. NEXT_PUBLIC_APP_URL when it's already https (production)
 *   3. the production app domain as a last-resort valid URL
 */
function backUrl(): string {
  const explicit = process.env.MERCADOPAGO_BACK_URL;
  if (explicit) return explicit;
  if (APP_URL.startsWith('https://')) return `${APP_URL}/billing?status=success`;
  return 'https://app.kuik.mx/billing?status=success';
}

/**
 * Create a recurring monthly subscription (preapproval) for a tenant and return
 * the hosted checkout URL (init_point). external_reference carries the tenant id
 * so the webhook can map payments back to the tenant.
 */
export async function createSubscription({
  tenantId,
  payerEmail,
  reason,
  plan = 'basic',
  addons = [],
  additional = false,
}: {
  tenantId: string;
  payerEmail: string;
  reason: string;
  plan?: 'basic' | 'pro';
  /** Paid add-ons folded into the same monthly charge. */
  addons?: readonly Addon[];
  additional?: boolean;
}): Promise<{ id: string; initPoint: string }> {
  const settings = await getPlatformSettings();
  const base = additional ? settings.extra_amount : plan === 'pro' ? settings.pro_amount : settings.plan_amount;
  const amount = base + (addons.includes('pos') ? settings.pos_addon_amount : 0);
  const preapproval = new PreApproval(mpClient());

  const result = await preapproval.create({
    body: {
      reason,
      external_reference: tenantId,
      payer_email: payerEmail,
      back_url: backUrl(),
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: amount,
        currency_id: settings.plan_currency,
      },
      status: 'pending',
    },
  });

  return {
    id: result.id!,
    initPoint: result.init_point!,
  };
}

/** Fetch the latest state of a preapproval from MercadoPago. */
export async function getPreapproval(id: string) {
  const preapproval = new PreApproval(mpClient());
  return preapproval.get({ id });
}

/**
 * Stop charging an earlier preapproval. Called when a restaurant moves to a
 * new plan or adds the point of sale: the change is a new preapproval, and
 * the old one must not keep billing alongside it.
 */
export async function cancelPreapproval(id: string): Promise<void> {
  const preapproval = new PreApproval(mpClient());
  await preapproval.update({ id, body: { status: 'cancelled' } });
}
