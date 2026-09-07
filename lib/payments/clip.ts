import 'server-only';
import { APP_URL } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CheckoutInput, CheckoutResult, PaymentAccount, PaymentEvent, PaymentGateway, WebhookRequest } from './types';

// Clip (payclip.com), the card reader most Mexican restaurants already have,
// as a gateway for the menu's online orders through its Checkout API: a
// hosted payment page per order (card, months without interest, OXXO).
//
// No OAuth and no marketplace: the restaurant creates an application on
// dashboard.clip.mx and pastes its API key and secret in Kuik's settings
// (app/(dashboard)/payments-actions.ts → connectClip). Money goes straight to
// the restaurant's Clip account; Kuik's cut cannot be withheld per payment
// the way Stripe and Mercado Pago allow, so `applicationFee` is ignored here.
//
// Clip's notification is a bare "look at link X" with no signature. The
// tenant is on the notification URL, and nothing is trusted from the body
// except the id, which is then read back from Clip with the restaurant's own
// credentials: a forged call can only make us re-read a real link.

const API = 'https://api.payclip.com';

export interface ClipCredentials {
  api_key: string;
  secret: string;
}

function creds(account: PaymentAccount): ClipCredentials | null {
  const c = account.credentials as Partial<ClipCredentials> | null;
  return c && typeof c.api_key === 'string' && typeof c.secret === 'string' ? (c as ClipCredentials) : null;
}

/** The Authorization header Clip wants: Basic over "api_key:secret". */
export function authHeader(c: ClipCredentials): string {
  return `Basic ${Buffer.from(`${c.api_key.trim()}:${c.secret.trim()}`).toString('base64')}`;
}

async function clipFetch(c: ClipCredentials, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: authHeader(c), 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
}

/**
 * Whether a key pair is accepted. Reads a link that cannot exist: Clip
 * answers 401 to a bad token before it looks anything up, and 404 (or 400)
 * to a good one.
 */
export async function verifyCredentials(c: ClipCredentials): Promise<boolean> {
  try {
    const res = await clipFetch(c, '/v2/checkout/00000000-0000-0000-0000-000000000000');
    return res.status !== 401 && res.status !== 403;
  } catch {
    return false;
  }
}

/** What GET /v2/checkout/{id} returns, the parts Kuik reads. */
export interface ClipCheckout {
  payment_request_id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  /** The transaction, only once completed; what a refund names. */
  receipt_no?: string;
  metadata?: { external_reference?: string } | null;
}

/** A Clip payment link → what Kuik cares about. Exported for tests. */
export function translateCheckout(c: ClipCheckout): PaymentEvent {
  const linkId = c.payment_request_id ?? '';
  const orderId = c.metadata?.external_reference || undefined;
  switch (c.status) {
    case 'CHECKOUT_COMPLETED':
      // The receipt is what a refund names; the order's payment_ref becomes it.
      return { type: 'paid', ref: c.receipt_no || linkId, amount: c.amount ?? 0, currency: (c.currency ?? 'MXN').toUpperCase(), orderId };
    case 'CHECKOUT_EXPIRED':
    case 'CHECKOUT_CANCELLED':
      return { type: 'failed', ref: linkId, orderId };
    default:
      // CHECKOUT_CREATED / CHECKOUT_PENDING: the guest is still on the page, or an OXXO voucher is waiting.
      return { type: 'ignored', reason: `status ${c.status ?? 'unknown'}` };
  }
}

async function readCheckout(c: ClipCredentials, id: string): Promise<ClipCheckout | null> {
  const res = await clipFetch(c, `/v2/checkout/${encodeURIComponent(id)}`);
  if (!res.ok) return null;
  return (await res.json()) as ClipCheckout;
}

export const clipGateway: PaymentGateway = {
  id: 'clip',

  async connect() {
    // There is no hosted onboarding: the settings page collects the key pair
    // and connectClip stores it.
    throw new Error('clip_uses_credentials');
  },

  async accountStatus(account) {
    const c = creds(account);
    if (!c) return { chargesEnabled: false, detailsSubmitted: false };
    const ok = await verifyCredentials(c);
    return { chargesEnabled: ok, detailsSubmitted: true };
  },

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const c = creds(input.account);
    if (!c) throw new Error('clip_not_connected');
    const notify = new URL(process.env.CLIP_NOTIFICATION_URL || `${APP_URL}/api/webhooks/clip`);
    notify.searchParams.set('tenant', input.tenantId);
    const summary = input.lines.map((l) => (l.qty > 1 ? `${l.qty}× ${l.name}` : l.name)).join(', ');
    const res = await clipFetch(c, '/v2/checkout', {
      method: 'POST',
      body: JSON.stringify({
        amount: Math.round(input.amount * 100) / 100,
        currency: input.currency.toUpperCase(),
        // No emoji, 250 chars: the restaurant's name and what was ordered.
        purchase_description: `${input.restaurantName} · ${summary}`.replace(/[\p{Extended_Pictographic}]/gu, '').slice(0, 250),
        redirection_url: { success: input.successUrl, error: input.cancelUrl, default: input.cancelUrl },
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        webhook_url: notify.toString(),
        metadata: {
          external_reference: input.orderId,
          ...(input.customerName ? { customer_info: { name: input.customerName.slice(0, 100) } } : {}),
        },
        override_settings: { locale: input.locale.startsWith('en') ? 'en-US' : 'es-MX', tip_enabled: false },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`clip_checkout_${res.status}: ${detail.slice(0, 200)}`);
    }
    const link = (await res.json()) as { payment_request_id?: string; payment_request_url?: string };
    if (!link.payment_request_id || !link.payment_request_url) throw new Error('clip_no_link');
    return { url: link.payment_request_url, ref: link.payment_request_id };
  },

  async refund({ account, ref, amount }) {
    const c = creds(account);
    if (!c) throw new Error('clip_not_connected');
    // `ref` is the receipt once the order was paid (applyPaymentEvent stores it).
    const res = await clipFetch(c, '/refunds', {
      method: 'POST',
      body: JSON.stringify({
        ...(amount != null ? { amount: Math.round(amount * 100) / 100 } : {}),
        reason: 'Reembolso desde Kuik',
        reference: { type: 'receipt', id: ref },
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`clip_refund_${res.status}: ${detail.slice(0, 200)}`);
    }
    const r = (await res.json()) as { id?: string; refund_id?: string };
    return { ref: String(r.id ?? r.refund_id ?? '') };
  },

  async parseWebhook(req: WebhookRequest): Promise<PaymentEvent> {
    let body: { id?: string; origin?: string; event_type?: string } = {};
    try {
      body = JSON.parse(req.rawBody);
    } catch {
      return { type: 'ignored', reason: 'unparseable body' };
    }
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!/^[0-9a-f-]{20,40}$/i.test(id)) return { type: 'ignored', reason: 'no link id' };
    const tenantId = req.searchParams.get('tenant');
    if (!tenantId) return { type: 'ignored', reason: 'no tenant' };
    const { data } = await createAdminClient().from('payment_accounts').select('*').eq('tenant_id', tenantId).eq('provider', 'clip').maybeSingle();
    const account = data as PaymentAccount | null;
    const c = account ? creds(account) : null;
    if (!c) return { type: 'ignored', reason: 'tenant not connected' };
    const checkout = await readCheckout(c, id);
    if (!checkout) return { type: 'ignored', reason: 'link not found' };
    return translateCheckout(checkout);
  },

  async checkStatus(account, ref) {
    const c = creds(account);
    if (!c) return { type: 'ignored', reason: 'not connected' };
    const checkout = await readCheckout(c, ref);
    return checkout ? translateCheckout(checkout) : { type: 'ignored', reason: 'link not found' };
  },
};
