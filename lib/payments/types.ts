// One shape for every payment gateway, so the cart, the order route and the
// order board never learn a provider's vocabulary. Stripe (lib/payments/stripe.ts)
// and Mercado Pago (lib/payments/mercadopago.ts) implement it; Clip would be
// another file exporting the same interface.

export type PaymentProvider = 'stripe' | 'mercadopago';

export interface PaymentAccount {
  tenant_id: string;
  provider: PaymentProvider;
  account_id: string;
  charges_enabled: boolean;
  details_submitted: boolean;
  /** Gateway secrets the server needs to act for the restaurant (OAuth tokens). Never leaves the server. */
  credentials: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

/** What the dashboard may see of an account: the flags, never the secrets. */
export type PublicPaymentAccount = Omit<PaymentAccount, 'credentials'>;

export interface CheckoutInput {
  orderId: string;
  tenantId: string;
  /** The connected account that receives the money. */
  account: PaymentAccount;
  restaurantName: string;
  /** Minor units are the gateway's business; this is the display amount. */
  amount: number;
  currency: string;
  /** Kuik's cut, same units as `amount`. */
  applicationFee: number;
  lines: { name: string; qty: number; unitAmount: number }[];
  customerName?: string | null;
  /** Where the guest lands after paying / after backing out. */
  successUrl: string;
  cancelUrl: string;
  locale: string;
}

export interface CheckoutResult {
  /** Redirect the guest here. */
  url: string;
  /** The gateway's id for this checkout; stored on the order as payment_ref. */
  ref: string;
}

export type PaymentEvent =
  | { type: 'paid'; ref: string; amount: number; currency: string; orderId?: string }
  | { type: 'failed'; ref: string; orderId?: string }
  | { type: 'refunded'; ref: string; orderId?: string }
  | { type: 'account'; accountId: string }
  | { type: 'ignored'; reason: string };

/** A webhook delivery as the gateway sent it: body, headers and query, since providers sign different parts. */
export interface WebhookRequest {
  rawBody: string;
  headers: Headers;
  searchParams: URLSearchParams;
}

export interface PaymentGateway {
  id: PaymentProvider;
  /**
   * Start onboarding (or resume it) for a tenant; returns where to send the
   * manager. `accountId` is empty when the gateway only reveals it at the end
   * of the flow (OAuth): the callback route stores it then.
   */
  connect(input: {
    tenantId: string;
    existingAccountId: string | null;
    email: string | null;
    displayName?: string | null;
    returnUrl: string;
    refreshUrl: string;
  }): Promise<{
    accountId: string;
    url: string;
  }>;
  /** Fresh capability flags for an account. */
  accountStatus(account: PaymentAccount): Promise<{ chargesEnabled: boolean; detailsSubmitted: boolean }>;
  /** A hosted checkout page for one order. */
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** Verify and translate a webhook delivery. Throws on a bad signature. */
  parseWebhook(req: WebhookRequest): Promise<PaymentEvent>;
}
