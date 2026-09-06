import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { stripeGateway, stripeConfigured } from './stripe';
import type { PaymentAccount, PaymentEvent, PaymentGateway, PaymentProvider } from './types';
import { notifyPaidOrder } from '@/lib/orders/notify';
import type { KitchenTicket } from '@/lib/pos/types';

export type { PaymentAccount, PaymentEvent, PaymentGateway, PaymentProvider } from './types';

const gateways: Record<PaymentProvider, PaymentGateway> = { stripe: stripeGateway };

export function getGateway(id: PaymentProvider = 'stripe'): PaymentGateway {
  return gateways[id];
}

/** Whether Kuik itself is set up to take online payments (keys present). */
export function paymentsConfigured(): boolean {
  return stripeConfigured();
}

export async function getPaymentAccount(tenantId: string): Promise<PaymentAccount | null> {
  const { data } = await createAdminClient().from('payment_accounts').select('*').eq('tenant_id', tenantId).maybeSingle();
  return (data as PaymentAccount | null) ?? null;
}

/**
 * The account can take money: the card capability is active. `details_submitted`
 * being false alongside means Stripe still wants something (an identity
 * document, say) — charges work meanwhile, and the dashboard shows the nudge.
 */
export function accountReady(a: PaymentAccount | null | undefined): a is PaymentAccount {
  return !!a && a.charges_enabled;
}

/** Pull fresh flags from the gateway and store them. */
export async function refreshAccount(account: PaymentAccount): Promise<PaymentAccount> {
  const status = await getGateway(account.provider).accountStatus(account.account_id);
  const next = { ...account, charges_enabled: status.chargesEnabled, details_submitted: status.detailsSubmitted, updated_at: new Date().toISOString() };
  await createAdminClient().from('payment_accounts').update({
    charges_enabled: next.charges_enabled,
    details_submitted: next.details_submitted,
    updated_at: next.updated_at,
  }).eq('tenant_id', account.tenant_id);
  return next;
}

/**
 * Apply what a gateway told us. Idempotent: a webhook delivered twice, or an
 * order already marked by the success redirect, changes nothing the second
 * time. Returns the order id it touched, if any.
 */
export async function applyPaymentEvent(event: PaymentEvent, provider: PaymentProvider): Promise<string | null> {
  const supabase = createAdminClient();

  if (event.type === 'ignored') return null;

  if (event.type === 'account') {
    const { data } = await supabase.from('payment_accounts').select('*').eq('provider', provider).eq('account_id', event.accountId).maybeSingle();
    if (data) await refreshAccount(data as PaymentAccount);
    return null;
  }

  // Find the order by its id when the gateway echoed it, else by the checkout ref.
  let q = supabase
    .from('orders')
    .select('id, tenant_id, payment_status, items, total, amount_paid, currency, customer_name, customer_phone, table_label, service_type, created_at, paid_at')
    .eq('payment_provider', provider);
  q = event.orderId ? q.eq('id', event.orderId) : q.eq('payment_ref', event.ref);
  const { data: order } = await q.maybeSingle();
  if (!order) return null;
  const o = order as {
    id: string;
    tenant_id: string;
    payment_status: string;
    items: unknown;
    total: number | null;
    amount_paid: number | null;
    currency: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    table_label: string | null;
    service_type: string | null;
    created_at: string;
    paid_at: string | null;
  };
  const now = new Date().toISOString();

  switch (event.type) {
    case 'paid': {
      if (o.payment_status === 'paid') return o.id;
      await supabase
        .from('orders')
        .update({ payment_status: 'paid', paid_at: now, amount_paid: event.amount, currency: event.currency, payment_ref: event.ref || undefined, updated_at: now })
        .eq('id', o.id);
      const tickets = await fireKitchenTickets(o);
      // The order is real now: tell the team, print it, confirm to the guest.
      await notifyPaidOrder({ ...o, amount_paid: event.amount, currency: event.currency, paid_at: now }, tickets);
      return o.id;
    }
    case 'failed':
      // Never downgrade a paid order because an old session expired.
      if (o.payment_status === 'paid') return o.id;
      await supabase.from('orders').update({ payment_status: 'failed', updated_at: now }).eq('id', o.id);
      return o.id;
    case 'refunded':
      await supabase.from('orders').update({ payment_status: 'refunded', updated_at: now }).eq('id', o.id);
      return o.id;
  }
}

/**
 * A paid online order is a real order: put it on the kitchen screen the way
 * the POS does, one ticket per station (category.station, else the category
 * name — the same rule as lib/pos). Orders paid at the counter are not fired
 * from here; the restaurant confirms those on WhatsApp first.
 */
async function fireKitchenTickets(o: { id: string; tenant_id: string; items: unknown; customer_name: string | null; table_label: string | null }): Promise<KitchenTicket[]> {
  const supabase = createAdminClient();
  const lines = (Array.isArray(o.items) ? o.items : []) as { productId?: string; name?: string; qty?: number; selections?: { name?: string }[]; note?: string }[];
  if (lines.length === 0) return [];

  const ids = [...new Set(lines.map((l) => l.productId).filter((x): x is string => !!x))];
  const { data: products } = ids.length
    ? await supabase.from('products').select('id, category_id').in('id', ids)
    : { data: [] as { id: string; category_id: string | null }[] };
  const catIds = [...new Set(((products ?? []) as { category_id: string | null }[]).map((p) => p.category_id).filter((x): x is string => !!x))];
  const { data: categories } = catIds.length
    ? await supabase.from('categories').select('id, name, station').in('id', catIds)
    : { data: [] as { id: string; name: string; station: string | null }[] };
  const catOf = new Map(((products ?? []) as { id: string; category_id: string | null }[]).map((p) => [p.id, p.category_id]));
  const stationOf = new Map(((categories ?? []) as { id: string; name: string; station: string | null }[]).map((c) => [c.id, c.station || c.name]));

  const byStation = new Map<string, typeof lines>();
  for (const l of lines) {
    const station = (l.productId && stationOf.get(catOf.get(l.productId) ?? '')) || 'Cocina';
    byStation.set(station, [...(byStation.get(station) ?? []), l]);
  }

  const label = o.table_label ? `Mesa ${o.table_label}` : `En línea · ${o.customer_name ?? o.id.slice(0, 6)}`;
  const now = new Date().toISOString();
  const rows = [...byStation].map(([station, group]) => ({
    tenant_id: o.tenant_id,
    tab_id: null,
    station,
    table_label: label,
    status: 'new',
    fired_at: now,
    items: group.map((g) => ({ name: g.name ?? '', qty: g.qty ?? 1, selections: g.selections ?? [], note: g.note ?? null })),
    created_at: now,
    updated_at: now,
  }));
  const { data } = await supabase.from('kitchen_tickets').insert(rows).select('*');
  return (data ?? []) as KitchenTicket[];
}
