import 'server-only';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendToTenant } from '@/lib/push/send';
import { bridgeConfigured, sendViaBridge } from '@/lib/whatsapp/bridge';
import { normalizeWaId, toE164 } from '@/lib/phone';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { formatPrice, orderCode } from '@/lib/utils';
import { kitchenDoc, onlineOrderDoc } from '@/lib/pos/print-doc';
import { printersFor } from '@/lib/pos/print-route';
import type { OrderRow, OrderStatus, Printer } from '@/lib/database.types';
import type { KitchenTicket } from '@/lib/pos/types';
import { resolveOrderAlerts, type OrderAlerts } from './alerts';

// How the restaurant hears about an order. A WhatsApp order announces itself:
// the guest's message lands on the restaurant's phone. A paid online order
// does not, so this module fans it out over whatever the restaurant enabled
// (lib/orders/alerts.ts): web push to the team, print jobs for the kitchen and
// the counter, a WhatsApp to the team through the linked bot, a confirmation
// to the guest — and, if nobody accepts it, an escalation from the cron.
//
// Everything here is best-effort and never throws into the caller: a webhook
// that already took the money must return 200 whatever happens to a push.

type Line = { productId?: string; name?: string; qty?: number; selections?: { name?: string }[]; note?: string | null };
type OrderLike = Pick<OrderRow, 'id' | 'tenant_id' | 'total' | 'amount_paid' | 'currency' | 'customer_name' | 'customer_phone' | 'service_type' | 'table_label' | 'created_at' | 'paid_at'> & { items: unknown };

interface Ctx {
  tenant: { id: string; name: string; locale: string };
  alerts: OrderAlerts;
  currency: string;
  printers: Printer[];
  /** A linked-device WhatsApp session that can message anyone, no template needed. */
  bridge: boolean;
}

const T = {
  es: {
    paidTitle: (code: string, total: string) => `Pedido pagado #${code} · ${total}`,
    newTitle: (code: string) => `Nuevo pedido #${code}`,
    nudgeTitle: (code: string) => `Pedido #${code} sin aceptar`,
    nudgeBody: (min: number) => `Lleva ${min} min pagado y nadie lo ha aceptado.`,
    accept: 'Aceptar',
    slipTitle: 'PEDIDO EN LÍNEA',
    slipPaid: 'PAGADO EN LÍNEA',
    team: (code: string, total: string, who: string, lines: string) => `🧾 Pedido pagado #${code} · ${total}\n${who}\n${lines}`,
    teamNudge: (code: string, min: number) => `⚠️ El pedido #${code} lleva ${min} min pagado y nadie lo ha aceptado.`,
    guestPaid: (r: string, code: string) => `¡Recibimos tu pago! Tu pedido #${code} ya está con ${r}. Te avisamos cuando esté listo.`,
    guestAccepted: (r: string, code: string) => `${r} ya está preparando tu pedido #${code}. 👨‍🍳`,
    guestReady: (r: string, code: string) => `¡Tu pedido #${code} está listo! Te espera en ${r}. 🎉`,
  },
  en: {
    paidTitle: (code: string, total: string) => `Order paid #${code} · ${total}`,
    newTitle: (code: string) => `New order #${code}`,
    nudgeTitle: (code: string) => `Order #${code} not accepted`,
    nudgeBody: (min: number) => `Paid ${min} min ago and nobody has accepted it.`,
    accept: 'Accept',
    slipTitle: 'ONLINE ORDER',
    slipPaid: 'PAID ONLINE',
    team: (code: string, total: string, who: string, lines: string) => `🧾 Order paid #${code} · ${total}\n${who}\n${lines}`,
    teamNudge: (code: string, min: number) => `⚠️ Order #${code} was paid ${min} min ago and nobody has accepted it.`,
    guestPaid: (r: string, code: string) => `Payment received! Your order #${code} is with ${r}. We will let you know when it is ready.`,
    guestAccepted: (r: string, code: string) => `${r} is now preparing your order #${code}. 👨‍🍳`,
    guestReady: (r: string, code: string) => `Your order #${code} is ready! It is waiting for you at ${r}. 🎉`,
  },
};
const tx = (locale: string) => (locale === 'en' ? T.en : T.es);

async function loadCtx(tenantId: string): Promise<Ctx | null> {
  const sb = createAdminClient();
  const [{ data: tenant }, { data: ordering }, { data: theme }, { data: printers }, { data: number }] = await Promise.all([
    sb.from('tenants').select('id, name, locale').eq('id', tenantId).maybeSingle(),
    sb.from('tenant_ordering').select('order_alerts').eq('tenant_id', tenantId).maybeSingle(),
    sb.from('tenant_theme').select('settings').eq('tenant_id', tenantId).maybeSingle(),
    sb.from('printers').select('*').eq('tenant_id', tenantId).eq('enabled', true),
    bridgeConfigured()
      ? sb.from('whatsapp_numbers').select('mode').eq('tenant_id', tenantId).eq('status', 'connected').eq('mode', 'bridge').maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const t = tenant as { id: string; name: string; locale: string | null } | null;
  if (!t) return null;
  return {
    tenant: { id: t.id, name: t.name, locale: t.locale ?? 'es' },
    alerts: resolveOrderAlerts((ordering as { order_alerts: unknown } | null)?.order_alerts),
    currency: resolveMenuSettings((theme as { settings: Record<string, unknown> | null } | null)?.settings ?? null).currency,
    printers: (printers ?? []) as Printer[],
    bridge: !!number,
  };
}

const lines = (o: OrderLike): Line[] => (Array.isArray(o.items) ? (o.items as Line[]) : []);
const summary = (o: OrderLike) => lines(o).map((l) => `${l.qty ?? 1}× ${l.name ?? ''}`).join(', ');
const who = (o: OrderLike) => [o.customer_name, o.service_type, o.table_label ? `Mesa ${o.table_label}` : null].filter(Boolean).join(' · ');
const money = (ctx: Ctx, n: number | null) => (n == null ? '' : formatPrice(n, ctx.currency, ctx.tenant.locale === 'en' ? 'en-US' : 'es-MX'));

async function waTo(tenantId: string, phone: string, text: string): Promise<void> {
  const e164 = toE164(phone) ?? normalizeWaId(phone);
  try {
    await sendViaBridge(tenantId, e164.replace('+', ''), { text });
  } catch (e) {
    console.error('[order-alerts] bridge send failed:', e instanceof Error ? e.message : e);
  }
}

async function enqueue(ctx: Ctx, printer: Printer, kind: 'kitchen' | 'receipt', doc: unknown, refId: string): Promise<void> {
  const now = new Date().toISOString();
  const rows = Array.from({ length: Math.max(1, printer.copies) }, () => ({
    id: randomUUID(),
    tenant_id: ctx.tenant.id,
    printer_id: printer.id,
    kind,
    doc,
    status: 'queued',
    attempts: 0,
    ref_id: refId,
    created_by: null,
    created_at: now,
    updated_at: now,
  }));
  await createAdminClient().from('print_jobs').insert(rows);
}

/** A paid online order: tell the team, print it, confirm to the guest. */
export async function notifyPaidOrder(o: OrderLike, tickets: KitchenTicket[]): Promise<void> {
  try {
    const ctx = await loadCtx(o.tenant_id);
    if (!ctx) return;
    const { alerts } = ctx;
    const code = orderCode(o.id);
    const total = money(ctx, o.amount_paid ?? o.total);
    const jobs: Promise<unknown>[] = [];

    if (alerts.push) {
      jobs.push(
        sendToTenant(o.tenant_id, ['owner', 'manager', 'cashier'], (locale) => {
          const t = tx(locale);
          return {
            title: t.paidTitle(code, total),
            body: [who(o), summary(o)].filter(Boolean).join('\n'),
            tag: `order-${o.id}`,
            url: '/orders',
            data: { orderId: o.id },
            actions: [{ action: 'accept', title: t.accept }],
            requireInteraction: true,
          };
        }),
      );
    }

    if (alerts.printKitchen) {
      for (const tk of tickets) {
        for (const p of printersFor(ctx.printers, 'kitchen', tk.station)) jobs.push(enqueue(ctx, p, 'kitchen', kitchenDoc(tk, ctx.tenant.locale), tk.id));
      }
    }
    if (alerts.printReceipt) {
      const t = tx(ctx.tenant.locale);
      const doc = onlineOrderDoc({
        code,
        restaurant: ctx.tenant.name,
        customerName: o.customer_name,
        customerPhone: o.customer_phone,
        service: o.service_type,
        table: o.table_label,
        when: new Date(o.paid_at ?? o.created_at).toLocaleString(ctx.tenant.locale === 'en' ? 'en-US' : 'es-MX', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
        items: lines(o),
        total: total || null,
        paidLabel: t.slipPaid,
        title: t.slipTitle,
      });
      for (const p of printersFor(ctx.printers, 'receipt')) jobs.push(enqueue(ctx, p, 'receipt', doc, o.id));
    }

    if (ctx.bridge) {
      const t = tx(ctx.tenant.locale);
      for (const phone of alerts.teamPhones) jobs.push(waTo(o.tenant_id, phone, t.team(code, total, who(o), summary(o))));
      if (alerts.confirmCustomer && o.customer_phone) jobs.push(waTo(o.tenant_id, o.customer_phone, t.guestPaid(ctx.tenant.name, code)));
    }

    await Promise.allSettled(jobs);
  } catch (e) {
    console.error('[order-alerts] paid:', e instanceof Error ? e.message : e);
  }
}

/** A WhatsApp order was logged. Off by default: the guest's message is the alert. */
export async function notifyWhatsappOrder(o: OrderLike): Promise<void> {
  try {
    const ctx = await loadCtx(o.tenant_id);
    if (!ctx || !ctx.alerts.whatsappOrders || !ctx.alerts.push) return;
    const code = orderCode(o.id);
    await sendToTenant(o.tenant_id, ['owner', 'manager', 'cashier'], (locale) => ({
      title: tx(locale).newTitle(code),
      body: [who(o), summary(o)].filter(Boolean).join('\n'),
      tag: `order-${o.id}`,
      url: '/orders',
      data: { orderId: o.id },
    }));
  } catch (e) {
    console.error('[order-alerts] whatsapp:', e instanceof Error ? e.message : e);
  }
}

/**
 * Staff moved an order. The first move stamps accepted_at (the escalation
 * stops); "preparing" and "ready" tell the guest through the bot when there
 * is one. Without a bot the board offers a one-tap wa.me link instead.
 */
export async function onOrderStatus(orderId: string, tenantId: string, status: OrderStatus): Promise<void> {
  try {
    const sb = createAdminClient();
    const { data } = await sb.from('orders').select('id, tenant_id, customer_phone, accepted_at').eq('id', orderId).eq('tenant_id', tenantId).maybeSingle();
    const o = data as { id: string; tenant_id: string; customer_phone: string | null; accepted_at: string | null } | null;
    if (!o) return;
    if (status !== 'new' && !o.accepted_at) await sb.from('orders').update({ accepted_at: new Date().toISOString() }).eq('id', o.id);
    if (!o.customer_phone || (status !== 'preparing' && status !== 'ready')) return;
    const ctx = await loadCtx(tenantId);
    if (!ctx || !ctx.bridge || !ctx.alerts.confirmCustomer) return;
    const t = tx(ctx.tenant.locale);
    const code = orderCode(o.id);
    await waTo(tenantId, o.customer_phone, status === 'preparing' ? t.guestAccepted(ctx.tenant.name, code) : t.guestReady(ctx.tenant.name, code));
  } catch (e) {
    console.error('[order-alerts] status:', e instanceof Error ? e.message : e);
  }
}

/**
 * Paid orders nobody has accepted. Level 1 after `escalateMinutes`: push to
 * the whole team. Level 2 at 2.5× that: push again and WhatsApp the team's
 * numbers through the bot. Orders older than six hours are left alone.
 */
export async function escalateOrders(now = Date.now()): Promise<{ checked: number; nudged: number; escalated: number }> {
  const sb = createAdminClient();
  const { data } = await sb
    .from('orders')
    .select('id, tenant_id, items, total, amount_paid, currency, customer_name, customer_phone, service_type, table_label, created_at, paid_at, alert_level')
    .eq('status', 'new')
    .eq('payment_status', 'paid')
    .lt('alert_level', 2)
    .gte('created_at', new Date(now - 6 * 3600_000).toISOString())
    .order('created_at', { ascending: true })
    .limit(200);
  const rows = (data ?? []) as (OrderLike & { alert_level: number })[];
  const out = { checked: rows.length, nudged: 0, escalated: 0 };
  const ctxs = new Map<string, Ctx | null>();

  for (const o of rows) {
    if (!ctxs.has(o.tenant_id)) ctxs.set(o.tenant_id, await loadCtx(o.tenant_id));
    const ctx = ctxs.get(o.tenant_id);
    if (!ctx || ctx.alerts.escalateMinutes === 0) continue;
    const age = Math.floor((now - new Date(o.paid_at ?? o.created_at).getTime()) / 60_000);
    const esc = ctx.alerts.escalateMinutes;
    const level = o.alert_level === 0 && age >= esc ? 1 : o.alert_level === 1 && age >= esc * 2.5 ? 2 : null;
    if (!level) continue;

    const code = orderCode(o.id);
    const jobs: Promise<unknown>[] = [];
    if (ctx.alerts.push) {
      jobs.push(
        sendToTenant(o.tenant_id, ['owner', 'manager', 'cashier', 'waiter', 'host'], (locale) => {
          const t = tx(locale);
          return { title: t.nudgeTitle(code), body: t.nudgeBody(age), tag: `order-${o.id}`, url: '/orders', data: { orderId: o.id }, actions: [{ action: 'accept', title: t.accept }], requireInteraction: true };
        }),
      );
    }
    if (level === 2 && ctx.bridge) {
      for (const phone of ctx.alerts.teamPhones) jobs.push(waTo(o.tenant_id, phone, tx(ctx.tenant.locale).teamNudge(code, age)));
    }
    await Promise.allSettled(jobs);
    await sb.from('orders').update({ alert_level: level }).eq('id', o.id);
    if (level === 1) out.nudged++;
    else out.escalated++;
  }
  return out;
}
