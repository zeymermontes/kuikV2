import 'server-only';
import Stripe from 'stripe';
import type { CheckoutInput, CheckoutResult, PaymentEvent, PaymentGateway, WebhookRequest } from './types';

// Stripe Connect, Accounts v2, "SaaS platform" shape: the restaurant is the
// merchant of record with a full Stripe dashboard, pays Stripe's fee and
// absorbs its own losses; Kuik takes an application fee on each direct charge.
// Onboarding is Stripe's hosted account link, so KYC and its remediation are
// Stripe's job, not ours.

let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('stripe_not_configured');
    client = new Stripe(key, { appInfo: { name: 'Kuik', url: 'https://kuik.mx' } });
  }
  return client;
}

/** Stripe wants integer minor units; MXN and most currencies have two decimals. */
const ZERO_DECIMAL = new Set(['jpy', 'krw', 'clp', 'vnd', 'xaf', 'xof']);
export function toMinor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? Math.round(amount) : Math.round(amount * 100);
}
export function fromMinor(amount: number, currency: string): number {
  return ZERO_DECIMAL.has(currency.toLowerCase()) ? amount : amount / 100;
}

export const stripeGateway: PaymentGateway = {
  id: 'stripe',

  async connect({ tenantId, existingAccountId, email, returnUrl, refreshUrl, displayName }) {
    const s = stripe();
    let accountId = existingAccountId;
    if (!accountId) {
      const account = await s.v2.core.accounts.create({
        display_name: displayName ?? undefined,
        contact_email: email ?? undefined,
        dashboard: 'full',
        identity: { country: 'mx' },
        defaults: {
          currency: 'mxn',
          locales: ['es-419'],
          responsibilities: { fees_collector: 'stripe', losses_collector: 'stripe' },
        },
        // Merchant = merchant of record for direct charges. Card is requested
        // here; OXXO and SPEI are enabled from the account's dashboard.
        configuration: { merchant: { capabilities: { card_payments: { requested: true } } } },
        metadata: { tenant_id: tenantId },
      });
      accountId = account.id;
    }
    const link = await s.v2.core.accountLinks.create({
      account: accountId,
      use_case: {
        type: 'account_onboarding',
        account_onboarding: { configurations: ['merchant'], return_url: returnUrl, refresh_url: refreshUrl },
      },
    });
    return { accountId, url: link.url };
  },

  async accountStatus(account) {
    const a = await stripe().v2.core.accounts.retrieve(account.account_id, { include: ['configuration.merchant', 'requirements'] });
    // v2 readiness: the card capability is live, and Stripe is not waiting on
    // anything due now. (`charges_enabled` is the v1 field and is not used.)
    const cardStatus = a.configuration?.merchant?.capabilities?.card_payments?.status;
    const dueNow = (a.requirements?.entries ?? []).some((e) => e.minimum_deadline?.status === 'currently_due' || e.minimum_deadline?.status === 'past_due');
    return { chargesEnabled: cardStatus === 'active', detailsSubmitted: !dueNow };
  },

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const currency = input.currency.toLowerCase();
    const session = await stripe().checkout.sessions.create(
      {
        mode: 'payment',
        client_reference_id: input.orderId,
        // OXXO and SPEI need a customer email; leaving it to Checkout's own
        // form keeps the cart short and works for card too.
        line_items: input.lines.map((l) => ({
          quantity: l.qty,
          price_data: { currency, unit_amount: toMinor(l.unitAmount, currency), product_data: { name: l.name.slice(0, 250) } },
        })),
        payment_intent_data: {
          application_fee_amount: toMinor(input.applicationFee, currency) || undefined,
          description: `${input.restaurantName} · pedido ${input.orderId.slice(0, 8)}`,
          metadata: { order_id: input.orderId, tenant_id: input.tenantId },
        },
        metadata: { order_id: input.orderId, tenant_id: input.tenantId },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        locale: input.locale.startsWith('es') ? 'es-419' : 'en',
        // No payment_method_types: Stripe offers whatever the restaurant's
        // account has enabled (card always, OXXO / SPEI once turned on).
        integration_identifier: 'kuik-menu-checkout-qtzrvmpk',
        expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      },
      { stripeAccount: input.account.account_id },
    );
    if (!session.url) throw new Error('stripe_no_checkout_url');
    return { url: session.url, ref: session.id };
  },

  async parseWebhook(req: WebhookRequest): Promise<PaymentEvent> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) throw new Error('stripe_not_configured');
    const signature = req.headers.get('stripe-signature');
    if (!signature) throw new Error('missing_signature');
    const event = stripe().webhooks.constructEvent(req.rawBody, signature, secret);
    return translate(event);
  },
};

/** Stripe's event zoo → the handful of things Kuik cares about. Exported for tests. */
export function translate(event: Stripe.Event): PaymentEvent {
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const s = event.data.object as Stripe.Checkout.Session;
      // A card pays inside the session; OXXO / SPEI complete later and arrive
      // as async_payment_succeeded, so `completed` with an unpaid status is
      // just "the guest finished the form".
      if (s.payment_status !== 'paid') return { type: 'ignored', reason: `payment_status ${s.payment_status}` };
      const currency = (s.currency ?? 'mxn').toLowerCase();
      return {
        type: 'paid',
        ref: s.id,
        amount: fromMinor(s.amount_total ?? 0, currency),
        currency: currency.toUpperCase(),
        orderId: s.metadata?.order_id ?? s.client_reference_id ?? undefined,
      };
    }
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      const s = event.data.object as Stripe.Checkout.Session;
      if (event.type === 'checkout.session.expired' && s.payment_status === 'paid') return { type: 'ignored', reason: 'expired after paid' };
      return { type: 'failed', ref: s.id, orderId: s.metadata?.order_id ?? s.client_reference_id ?? undefined };
    }
    case 'charge.refunded': {
      const c = event.data.object as Stripe.Charge;
      const orderId = c.metadata?.order_id;
      // The refund names the charge, not the session; the order id in the
      // payment intent's metadata is the bridge.
      return orderId ? { type: 'refunded', ref: '', orderId } : { type: 'ignored', reason: 'refund without order_id' };
    }
    case 'account.updated': {
      // The v1 event still fires for v2 accounts; its flags are v1's, so the
      // handler re-reads the account through accountStatus instead.
      const a = event.data.object as Stripe.Account;
      return { type: 'account', accountId: a.id };
    }
    default:
      return { type: 'ignored', reason: event.type };
  }
}
