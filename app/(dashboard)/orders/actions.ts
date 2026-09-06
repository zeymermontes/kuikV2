'use server';

import { requireOrders, requireManager } from '@/lib/auth';
import { getGateway, getPaymentAccount, isPaymentProvider } from '@/lib/payments';
import { createClient } from '@/lib/supabase/server';
import type { OrderRow, OrderStatus } from '@/lib/database.types';
import { onOrderStatus } from '@/lib/orders/notify';

/** Active orders (not yet delivered), oldest first (FIFO for the kitchen). */
export async function listOrders(): Promise<OrderRow[]> {
  const { tenant } = await requireOrders();
  const supabase = await createClient();
  const { data } = await supabase
    .from('orders')
    .select('*')
    .eq('tenant_id', tenant.id)
    .neq('status', 'done')
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
