'use server';

import { revalidatePath } from 'next/cache';
import { requireOrders, requireManager } from '@/lib/auth';
import { getGateway, getPaymentAccount, isPaymentProvider } from '@/lib/payments';
import { createClient } from '@/lib/supabase/server';
import type { OrderRow, OrderStatus } from '@/lib/database.types';
import { onOrderStatus } from '@/lib/orders/notify';
import { lineTotal, type EditableLine } from '@/lib/orders/edit';

/** Active orders (not yet delivered), oldest first (FIFO for the kitchen). */
export async function listOrders(): Promise<OrderRow[]> {
  const { tenant } = await requireOrders();
  const supabase = await createClient();
  const { data } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenant.id)
    .in('status', ['new', 'preparing', 'ready'])
    .order('created_at', { ascending: true })
    .limit(100);
  return (data ?? []) as OrderRow[];
}

export async function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const { tenant } = await requireOrders();
  const supabase = await createClient();
  await supabase.from('orders').update({ status }).eq('id', id).eq('tenant_id', tenant.id);
  // Stamp acceptance and, with a bot, tell the guest. Best-effort.
  await onOrderStatus(id, tenant.id, status);
}

/**
 * Give an online payment back through the gateway that took it. Whole amount
 * unless `amount` is given. The order is marked refunded right away; the
 * gateway's own webhook says the same later and is a no-op then.
 */
export async function refundOrder(id: string, amount?: number): Promise<{ error?: string }> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const { data } = await supabase.from('orders').select('*').eq('id', id).eq('tenant_id', tenant.id).maybeSingle();
  const o = data as OrderRow | null;
  if (!o) return { error: 'not_found' };
  if (o.payment_status !== 'paid' || !o.payment_ref || !isPaymentProvider(o.payment_provider)) return { error: 'not_refundable' };
  const account = await getPaymentAccount(tenant.id);
  if (!account || account.provider !== o.payment_provider) return { error: 'no_account' };
  const total = Number(o.amount_paid ?? o.total ?? 0);
  const value = amount != null ? Math.min(amount, total) : total;
  if (!(value > 0)) return { error: 'nothing' };
  try {
    const r = await getGateway(o.payment_provider).refund({ account, ref: o.payment_ref, amount: value < total ? value : undefined, currency: o.currency ?? 'MXN' });
    await supabase
      .from('orders')
      .update({ payment_status: 'refunded', refund_ref: r.ref, refunded_at: new Date().toISOString(), amount_refunded: value })
      .eq('id', id)
      .eq('tenant_id', tenant.id);
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'refund_failed' };
  }
}

/**
 * Turn an order down. It leaves the board; with a bot the guest is told the
 * reason, otherwise the board offers a one-tap WhatsApp message. A paid
 * order is not refunded here: that is the refund button's job.
 */
export async function rejectOrder(id: string, reason: string): Promise<void> {
  const { tenant } = await requireOrders();
  const supabase = await createClient();
  const why = reason.trim().slice(0, 300) || null;
  await supabase.from('orders').update({ status: 'rejected', reject_reason: why }).eq('id', id).eq('tenant_id', tenant.id);
  await onOrderStatus(id, tenant.id, 'rejected', why ?? undefined);
}

/**
 * Change what an order holds (a line out, a quantity, a note) and its total.
 * Only unpaid orders: a paid one's total is the gateway's. The total is what
 * the board computed from the lines, unless staff typed another.
 */
export async function updateOrder(id: string, input: { items: EditableLine[]; total: number | null; note: string | null }): Promise<{ error?: string }> {
  const { tenant } = await requireOrders();
  const supabase = await createClient();
  const { data } = await supabase.from('orders').select('payment_status').eq('id', id).eq('tenant_id', tenant.id).maybeSingle();
  if (!data) return { error: 'not_found' };
  if ((data as { payment_status: string }).payment_status === 'paid') return { error: 'paid' };
  const items = input.items.filter((l) => (l.qty ?? 1) > 0).slice(0, 100);
  if (items.length === 0) return { error: 'empty' };
  const total = input.total != null && Number.isFinite(input.total) ? Math.max(0, input.total) : items.reduce((n, l) => n + lineTotal(l), 0);
  await supabase
    .from('orders')
    .update({ items, total, note: input.note?.trim() || null, edited_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  return {};
}

/** Turn the Pedidos board on for this restaurant (0085); owners and managers, from the board's own off-state page. */
export async function enableOrdersBoard(): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const { data } = await supabase.from('tenant_ordering').select('tenant_id').eq('tenant_id', tenant.id).maybeSingle();
  if (data) await supabase.from('tenant_ordering').update({ orders_board: true }).eq('tenant_id', tenant.id);
  else await supabase.from('tenant_ordering').insert({ tenant_id: tenant.id, orders_board: true });
  revalidatePath('/orders');
}
