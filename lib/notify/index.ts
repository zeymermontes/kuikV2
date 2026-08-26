import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { manualWhatsapp } from './manual-wa';
import { bridgeNotifier } from './bridge-wa';
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
  if (number?.mode === 'bridge') return bridgeNotifier;

  return manualWhatsapp;
}
