import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Whether this restaurant has the Pedidos board (0085): the super admin's
 * switch. Read by the layouts that mount the board's entry points (sidebar
 * item, hub tile, live alerts) and by the order route before it stores a
 * WhatsApp order.
 */
export async function ordersBoardEnabled(tenantId: string): Promise<boolean> {
  const { data } = await createAdminClient().from('tenant_ordering').select('orders_board').eq('tenant_id', tenantId).maybeSingle();
  return !!(data as { orders_board?: boolean } | null)?.orders_board;
}
