import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrderAlerts, type OrderAlerts } from './alerts';

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

/** The board switch together with the alert switches the layouts mount by. */
export async function ordersBoardConfig(tenantId: string): Promise<{ board: boolean; alerts: OrderAlerts }> {
  const { data } = await createAdminClient().from('tenant_ordering').select('orders_board, order_alerts').eq('tenant_id', tenantId).maybeSingle();
  const row = data as { orders_board?: boolean; order_alerts?: unknown } | null;
  return { board: !!row?.orders_board, alerts: resolveOrderAlerts(row?.order_alerts) };
}
