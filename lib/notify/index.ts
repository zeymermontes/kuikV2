import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { manualWhatsapp } from './manual-wa';
import { bridgeNotifier } from './bridge-wa';
import { conversationForReservation, conversationNotifier } from './conversation-wa';
import { bridgeConversationFor } from './bridge-conversation';
import type { CustomerNotifier, NotifyInput, NotifyResult } from './types';

export * from './types';
export { renderNotification } from './messages';

/** Nothing to send to — the diner left no phone number. */
const noChannel: CustomerNotifier = {
  channel: 'none',
  automatic: false,
  async send(): Promise<NotifyResult> {
    return { status: 'skipped' };
  },
};

/**
 * Pick how this restaurant reaches its diners.
 *
 * Today there is exactly one real answer. When the WhatsApp Cloud API work
 * lands, it adds a branch here — a connected number with an approved template
 * returns an automatic notifier — and every caller starts sending for real
 * with no other change. The reminder cron in particular needs no edit at all.
 */
export async function getNotifier(input: NotifyInput): Promise<CustomerNotifier> {
  // A diner who has chatted with the restaurant gets the note in that chat,
  // whichever transport carries it — free-form inside the window, template
  // outside it, the manual link as the last resort.
  const conversationId = await conversationForReservation(input.tenant.id, input.reservation);
  if (conversationId) return conversationNotifier(conversationId);

  if (!input.reservation.phone) return noChannel;

  // A linked device is the restaurant's own account sending a message, so
  // there is no 24-hour window and no template to get approved — a reminder
  // the day before can simply go out. On the Cloud API it cannot, which is
  // why the manual one-tap path stays.
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('whatsapp_numbers')
    .select('mode, status')
    .eq('tenant_id', input.tenant.id)
    .eq('status', 'connected')
    .maybeSingle();

  const number = data as { mode: string; status: string } | null;
  if (number?.mode === 'bridge') {
    // Open the chat first so the note is a real message in a transcript the
    // host can read and answer; the bare send stays as the fallback.
    const opened = await bridgeConversationFor(input.tenant.id, input.reservation.phone);
    return opened ? conversationNotifier(opened) : bridgeNotifier;
  }

  return manualWhatsapp;
}
