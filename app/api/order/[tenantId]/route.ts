import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIp, bucketKey } from '@/lib/rate-limit';
import { tenantBaseUrl } from '@/lib/config';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { getPlatformSettings } from '@/lib/platform';
import { accountReady, getGateway, getPaymentAccount, paymentsConfigured } from '@/lib/payments';
import { applicationFee, priceOrder } from '@/lib/payments/pricing';
import { normalizePhone, safeReturnPath } from '@/lib/payments/return-path';
import { notifyWhatsappOrder } from '@/lib/orders/notify';
import { effectivePlan, feePercentFor } from '@/lib/plan';
import type { OrderRow } from '@/lib/database.types';
import type { CartLine } from '@/lib/whatsapp';

export const runtime = 'nodejs';

/**
 * Records an order from the public menu.
 *
 * Without `pay`, this is analytics: the real order travels to the restaurant
 * as a WhatsApp message and the row feeds the order board. With `pay`, the
 * order is created as payment-pending and the response carries the gateway's
 * checkout URL; the webhook marks it paid and the guest comes back to the menu
 * to send the (now "pagado") WhatsApp message.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;

  // This route is public, unauthenticated and writes with the service role, so
  // the limiter is the only thing standing between it and a script.
  // Two buckets: one per caller, one per tenant, because a botnet defeats the
  // first but still has to land everything on the same restaurant.
  const ip = clientIp(req);
  const [byIp, byTenant] = await Promise.all([
    rateLimit(bucketKey('order:ip', `${tenantId}:${ip}`, 60), 10, 60),
    rateLimit(bucketKey('order:tenant', tenantId, 60), 200, 60),
  ]);
  if (!byIp.ok || !byTenant.ok) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  let body: {
    items?: unknown;
    total?: number | null;
    customer_name?: string | null;
    customer_phone?: string | null;
    service_type?: string | null;
    table_label?: string | null;
    payment_method?: string | null;
    pay?: { service?: string; tipPercent?: number; locale?: string; returnPath?: string } | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = createAdminClient();
  const paying = !!body.pay && body.payment_method === 'online';
  const row = {
    tenant_id: tenantId,
    items: body.items,
    total: body.total ?? null,
    customer_name: body.customer_name?.slice(0, 120) ?? null,
    // Only present when given, so an install that has not run 0067 yet still logs WhatsApp orders.
    ...(normalizePhone(body.customer_phone) ? { customer_phone: normalizePhone(body.customer_phone) } : {}),
    service_type: body.service_type ?? null,
    table_label: body.table_label ?? null,
    payment_method: typeof body.payment_method === 'string' ? body.payment_method.slice(0, 20) : null,
    channel: 'whatsapp',
  };

  if (!paying) {
    const { data: logged } = await supabase.from('orders').insert(row).select('*').maybeSingle();
    // Off unless the restaurant asked for it: the guest's WhatsApp is the alert.
    if (logged) await notifyWhatsappOrder(logged as OrderRow);
    return NextResponse.json({ ok: true });
  }

  // ── Online payment ────────────────────────────────────────────────────────
  if (!paymentsConfigured()) return NextResponse.json({ ok: false, error: 'online_unavailable' }, { status: 409 });
  // The WhatsApp message may never follow a paid order, so the number is the
  // restaurant's only way to reach the guest about it.
  if (!row.customer_phone) return NextResponse.json({ ok: false, error: 'phone_required' }, { status: 400 });

  const [{ data: tenant }, { data: theme }, { data: ordering }, account, platform, { data: sub }] = await Promise.all([
    supabase.from('tenants').select('id, name, subdomain, custom_domain').eq('id', tenantId).maybeSingle(),
    supabase.from('tenant_theme').select('settings').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('tenant_ordering').select('payment_methods, delivery_fee, free_delivery_over, ordering_enabled').eq('tenant_id', tenantId).maybeSingle(),
    getPaymentAccount(tenantId),
    getPlatformSettings(),
    supabase.from('subscriptions').select('status, plan').eq('tenant_id', tenantId).maybeSingle(),
  ]);
  const tier = effectivePlan((sub as { status: 'trialing' | 'active' | 'past_due' | 'canceled'; plan: 'basic' | 'pro' } | null) ?? { status: 'trialing', plan: 'basic' });
  const t = tenant as { id: string; name: string; subdomain: string; custom_domain: string | null } | null;
  const ord = ordering as { payment_methods: string[]; delivery_fee: number | null; free_delivery_over: number | null; ordering_enabled: boolean } | null;
  if (!t || !ord || !ord.ordering_enabled || !ord.payment_methods?.includes('online') || !accountReady(account)) {
    return NextResponse.json({ ok: false, error: 'online_unavailable' }, { status: 409 });
  }

  // Price from the menu, not from the cart.
  const lines = body.items as CartLine[];
  const ids = [...new Set(lines.map((l) => l.productId).filter(Boolean))];
  const { data: products } = await supabase.from('products').select('id, price, is_available').eq('tenant_id', tenantId).in('id', ids);
  const priceOf = new Map(((products ?? []) as { id: string; price: number | null; is_available: boolean }[]).map((p) => [p.id, p.is_available ? p.price : null]));
  const amount = priceOrder(lines, (id) => priceOf.get(id) ?? null, {
    tipPercent: body.pay?.tipPercent,
    deliveryFee: ord.delivery_fee,
    freeDeliveryOver: ord.free_delivery_over,
    delivery: body.pay?.service === 'delivery',
  });
  if (!amount) return NextResponse.json({ ok: false, error: 'unpriced' }, { status: 409 });

  const currency = resolveMenuSettings((theme as { settings: Record<string, unknown> | null } | null)?.settings ?? null).currency;
  const { data: inserted, error } = await supabase
    .from('orders')
    .insert({ ...row, total: amount.total, currency, payment_status: 'pending', payment_provider: account.provider })
    .select('id')
    .single();
  if (error || !inserted) return NextResponse.json({ ok: false }, { status: 500 });
  const orderId = (inserted as { id: string }).id;

  // Back to the page the cart was on: `/` or `/menu`, whichever this restaurant uses.
  const back = `${tenantBaseUrl(t.subdomain, t.custom_domain)}${safeReturnPath(body.pay?.returnPath)}`;
  try {
    const checkout = await getGateway(account.provider).createCheckout({
      orderId,
      tenantId,
      account,
      restaurantName: t.name,
      amount: amount.total,
      currency,
      applicationFee: applicationFee(amount.total, feePercentFor(platform, tier)),
      lines: [
        ...amount.lines,
        ...(amount.deliveryFee > 0 ? [{ name: 'Envío', qty: 1, unitAmount: amount.deliveryFee }] : []),
        ...(amount.tip > 0 ? [{ name: 'Propina', qty: 1, unitAmount: amount.tip }] : []),
      ],
      customerName: row.customer_name,
      successUrl: `${back}?pedido=${orderId}&pago=ok`,
      cancelUrl: `${back}?pedido=${orderId}&pago=cancel`,
      locale: body.pay?.locale ?? 'es',
    });
    await supabase.from('orders').update({ payment_ref: checkout.ref }).eq('id', orderId);
    return NextResponse.json({ ok: true, orderId, payUrl: checkout.url, total: amount.total });
  } catch (e) {
    console.error('[order] checkout failed:', e instanceof Error ? e.message : e);
    await supabase.from('orders').update({ payment_status: 'failed' }).eq('id', orderId);
    return NextResponse.json({ ok: false, error: 'checkout_failed' }, { status: 502 });
  }
}

/**
 * The guest is back from checkout: the payment state and enough of the order
 * to show a confirmation (number, lines, total). Public, by order id — a UUID
 * nobody can guess — and without the phone or anything the guest did not type.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const id = req.nextUrl.searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false }, { status: 400 });
  const { data } = await createAdminClient()
    .from('orders')
    .select('id, payment_status, amount_paid, currency, items, total, customer_name, service_type, table_label, created_at, paid_at')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (!data) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true, ...(data as object) });
}
