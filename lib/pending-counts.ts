import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * What is waiting for a person at this restaurant, by product — the numbers
 * the host's bell, the hub's tiles and the phone's app icon all show, from
 * one place so they never disagree.
 */
export interface PendingCounts {
  /** Booking requests waiting for a yes or no, guests asking to cancel, and cancellations nobody has seen. */
  bookings: number;
  /** WhatsApp chats parked for a person. */
  chats: number;
}

export const NEEDS_DECISION =
  'status.eq.pending,and(status.in.(confirmed,waiting,notified),cancel_requested_at.not.is.null),and(status.eq.cancelled,cancelled_by.eq.guest,cancel_seen_at.is.null)';

export async function pendingCounts(tenantId: string): Promise<PendingCounts> {
  const supabase = createAdminClient();
  const [{ count: bookings }, { count: chats }] = await Promise.all([
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .or(NEEDS_DECISION)
      .gte('starts_at', new Date().toISOString()),
    supabase
      .from('whatsapp_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('handoff_at', 'is', null),
  ]);
  return { bookings: bookings ?? 0, chats: chats ?? 0 };
}
