'use server';

import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { OrderRow, OrderStatus } from '@/lib/database.types';

/** Active orders (not yet delivered), oldest first (FIFO for the kitchen). */
export async function listOrders(): Promise<OrderRow[]> {
  const { tenant } = await requireTenant();
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
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  await supabase.from('orders').update({ status }).eq('id', id).eq('tenant_id', tenant.id);
}
