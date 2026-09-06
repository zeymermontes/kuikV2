import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { MercadoPagoConfig, OAuth, Payment, Preference, User, WebhookSignatureValidator, PaymentRefund } from 'mercadopago';
import { APP_URL } from '@/lib/config';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CheckoutInput, CheckoutResult, PaymentAccount, PaymentEvent, PaymentGateway, WebhookRequest } from './types';

// Mercado Pago, marketplace shape: the restaurant links its own Mercado Pago
// account through OAuth and is the seller of record; Kuik creates Checkout Pro
// preferences with the seller's token and keeps `marketplace_fee` per payment.
// Money lands in the restaurant's Mercado Pago account, minus MP's fee and
// Kuik's. Kuik's own platform token (the one that bills subscriptions) is only
// used to instantiate the SDK and to exchange OAuth codes.
//
// Env: MERCADOPAGO_CLIENT_ID + MERCADOPAGO_CLIENT_SECRET (the application in
// developers.mercadopago), MERCADOPAGO_WEBHOOK_SIGNING_SECRET (the "clave
// secreta" of its Webhooks page; falls back to MERCADOPAGO_WEBHOOK_SECRET).

export function mercadopagoConfigured(): boolean {
  return Boolean(process.env.MERCADOPAGO_CLIENT_ID && process.env.MERCADOPAGO_CLIENT_SECRET && process.env.MERCADOPAGO_ACCESS_TOKEN);
}

function signingSecret(): string | undefined {
  return process.env.MERCADOPAGO_WEBHOOK_SIGNING_SECRET || process.env.MERCADOPAGO_WEBHOOK_SECRET;
}

function config(accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN ?? ''): MercadoPagoConfig {
  return new MercadoPagoConfig({ accessToken, options: { timeout: 10_000, integratorId: process.env.MP_INTEGRATOR_ID } });
}

/** The redirect URI registered on the application. Must be https in production; MERCADOPAGO_OAUTH_REDIRECT overrides it locally (ngrok). */
export function oauthRedirectUri(): string {
  return process.env.MERCADOPAGO_OAUTH_REDIRECT || `${APP_URL}/api/payments/mercadopago/callback`;
}

// ── OAuth state: the tenant id, signed, so the callback can trust who is connecting ──

function sign(tenantId: string): string {
  return createHmac('sha256', process.env.MERCADOPAGO_CLIENT_SECRET ?? '').update(tenantId).digest('hex').slice(0, 32);
}
export function oauthState(tenantId: string): string {
  return `${tenantId}.${sign(tenantId)}`;
}
export function tenantFromState(state: string | null): string | null {
  if (!state) return null;
  const i = state.lastIndexOf('.');
  if (i <= 0) return null;
  const tenantId = state.slice(0, i);
  const mac = state.slice(i + 1);
  const expected = sign(tenantId);
  if (mac.length !== expected.length) return null;
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected)) ? tenantId : null;
}

// ── Credentials ─────────────────────────────────────────────────────────────

export interface MpCredentials {
  access_token: string;
  refresh_token: string | null;
  /** ISO time the access token stops working (MP issues ~180 days). */
  expires_at: string | null;
  public_key: string | null;
  live_mode: boolean;
}

function creds(account: PaymentAccount): MpCredentials | null {
  const c = account.credentials as Partial<MpCredentials> | null;
  return c && typeof c.access_token === 'string' ? (c as MpCredentials) : null;
}

function credentialsFrom(r: { access_token?: string; refresh_token?: string; expires_in?: number; public_key?: string; live_mode?: boolean }): MpCredentials {
  if (!r.access_token) throw new Error('mp_no_access_token');
  return {
    access_token: r.access_token,
    refresh_token: r.refresh_token ?? null,
    expires_at: r.expires_in ? new Date(Date.now() + r.expires_in * 1000).toISOString() : null,
    public_key: r.public_key ?? null,
    live_mode: !!r.live_mode,
  };
}

/** Exchange the code the seller came back with; returns the seller's MP user id and tokens. */
export async function exchangeCode(code: string): Promise<{ accountId: string; credentials: MpCredentials }> {
  const r = await new OAuth(config()).create({
    body: { client_id: process.env.MERCADOPAGO_CLIENT_ID, client_secret: process.env.MERCADOPAGO_CLIENT_SECRET, code, redirect_uri: oauthRedirectUri() },
  });
  if (!r.user_id) throw new Error('mp_no_user_id');
  return { accountId: String(r.user_id), credentials: credentialsFrom(r) };
}

/**
 * A token good for the next call: refreshed and stored when it is within a
 * week of expiring. A seller who revoked the app gets no token, and the
 * account reads as not ready until they connect again.
 */
async function freshToken(account: PaymentAccount): Promise<string | null> {
  const c = creds(account);
  if (!c) return null;
  const soon = Date.now() + 7 * 24 * 3600_000;
  if (!c.expires_at || new Date(c.expires_at).getTime() > soon || !c.refresh_token) return c.access_token;
  try {
    const r = await new OAuth(config()).refresh({
      body: { client_id: process.env.MERCADOPAGO_CLIENT_ID, client_secret: process.env.MERCADOPAGO_CLIENT_SECRET, refresh_token: c.refresh_token },
    });
    const next = credentialsFrom(r);
    await createAdminClient().from('payment_accounts').update({ credentials: next, updated_at: new Date().toISOString() }).eq('tenant_id', account.tenant_id);
    return next.access_token;
  } catch (e) {
    console.error('[mercadopago] token refresh failed:', e instanceof Error ? e.message : e);
    return c.access_token;
  }
}

// ── The gateway ─────────────────────────────────────────────────────────────

export const mercadopagoGateway: PaymentGateway = {
  id: 'mercadopago',

  async connect({ tenantId }) {
    if (!mercadopagoConfigured()) throw new Error('mercadopago_not_configured');
    const u = new URL('https://auth.mercadopago.com.mx/authorization');
    u.searchParams.set('client_id', process.env.MERCADOPAGO_CLIENT_ID!);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('platform_id', 'mp');
    u.searchParams.set('state', oauthState(tenantId));
    u.searchParams.set('redirect_uri', oauthRedirectUri());
    // The seller's id is only known after they authorise; the callback stores it.
    return { accountId: '', url: u.toString() };
  },

  async accountStatus(account) {
    const token = await freshToken(account);
    if (!token) return { chargesEnabled: false, detailsSubmitted: false };
    try {
      // The cheapest authenticated call: proves the token still works.
      await new User(config(token)).get();
      return { chargesEnabled: true, detailsSubmitted: true };
    } catch {
      return { chargesEnabled: false, detailsSubmitted: true };
    }
  },

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const token = await freshToken(input.account);
    if (!token) throw new Error('mercadopago_not_connected');
    const currency = input.currency.toUpperCase();
    const notify = new URL(process.env.MERCADOPAGO_NOTIFICATION_URL || `${APP_URL}/api/webhooks/mercadopago/payments`);
    notify.searchParams.set('tenant', input.tenantId);
    const pref = await new Preference(config(token)).create({
      body: {
        items: input.lines.map((l, i) => ({
          id: `line-${i + 1}`,
          title: l.name.slice(0, 250),
          quantity: l.qty,
          unit_price: Math.round(l.unitAmount * 100) / 100,
          currency_id: currency,
        })),
        payer: input.customerName ? { name: input.customerName.slice(0, 120) } : undefined,
        external_reference: input.orderId,
        metadata: { order_id: input.orderId, tenant_id: input.tenantId },
        // Kuik's cut, as an amount in the same currency.
        marketplace_fee: input.applicationFee > 0 ? Math.round(input.applicationFee * 100) / 100 : undefined,
        back_urls: { success: input.successUrl, pending: input.successUrl, failure: input.cancelUrl },
        auto_return: 'approved',
        notification_url: notify.toString(),
        statement_descriptor: input.restaurantName.slice(0, 22),
        expires: true,
        expiration_date_to: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
    });
    if (!pref.id || !pref.init_point) throw new Error('mercadopago_no_init_point');
    return { url: pref.init_point, ref: pref.id };
  },

  async refund({ account, ref, amount }) {
    const token = await freshToken(account);
    if (!token) throw new Error('mercadopago_not_connected');
    // `ref` is the payment id once the order was paid (applyPaymentEvent stores it).
    const r = await new PaymentRefund(config(token)).create({
      payment_id: ref,
      body: amount != null ? { amount: Math.round(amount * 100) / 100 } : undefined,
    });
    return { ref: String(r.id ?? '') };
  },

  async parseWebhook(req: WebhookRequest): Promise<PaymentEvent> {
    const secret = signingSecret();
    if (!secret) throw new Error('mercadopago_not_configured');
    const dataId = req.searchParams.get('data.id') ?? req.searchParams.get('id');
    // Throws InvalidWebhookSignatureError on anything but a genuine delivery.
    WebhookSignatureValidator.validate({
      xSignature: req.headers.get('x-signature'),
      xRequestId: req.headers.get('x-request-id'),
      dataId,
      secret,
      toleranceSeconds: 600,
    });

    let body: { type?: string; action?: string; data?: { id?: string | number } } = {};
    try {
      body = JSON.parse(req.rawBody);
    } catch {
      return { type: 'ignored', reason: 'unparseable body' };
    }
    if (body.type !== 'payment') return { type: 'ignored', reason: body.type ?? 'no type' };
    const paymentId = String(body.data?.id ?? dataId ?? '');
    if (!paymentId) return { type: 'ignored', reason: 'no payment id' };

    // The notification names the payment, not the money's owner; we put the
    // tenant on the notification URL so we know whose token reads it.
    const tenantId = req.searchParams.get('tenant');
    if (!tenantId) return { type: 'ignored', reason: 'no tenant' };
    const { data } = await createAdminClient().from('payment_accounts').select('*').eq('tenant_id', tenantId).eq('provider', 'mercadopago').maybeSingle();
    const account = data as PaymentAccount | null;
    const token = account ? await freshToken(account) : null;
    if (!token) return { type: 'ignored', reason: 'tenant not connected' };

    const payment = await new Payment(config(token)).get({ id: paymentId });
    return translatePayment(payment);
  },
};

/** A Mercado Pago payment → what Kuik cares about. Exported for tests. */
export function translatePayment(p: {
  id?: number | string;
  status?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  metadata?: { order_id?: string } | null;
}): PaymentEvent {
  const ref = String(p.id ?? '');
  const orderId = p.metadata?.order_id ?? p.external_reference ?? undefined;
  switch (p.status) {
    case 'approved':
      return { type: 'paid', ref, amount: p.transaction_amount ?? 0, currency: (p.currency_id ?? 'MXN').toUpperCase(), orderId };
    case 'rejected':
    case 'cancelled':
      return { type: 'failed', ref, orderId };
    case 'refunded':
    case 'charged_back':
      return { type: 'refunded', ref, orderId };
    default:
      // pending / in_process / authorized: OXXO voucher printed, SPEI awaiting — wait for the next notification.
      return { type: 'ignored', reason: `status ${p.status ?? 'unknown'}` };
  }
}
