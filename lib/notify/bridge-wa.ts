import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendViaBridge } from '@/lib/whatsapp/bridge';
import { normalizeWaId, toE164 } from '@/lib/phone';
import type { CustomerNotifier, NotifyInput, NotifyResult } from './types';

/**
 * Send the diner a message through the linked-device bridge.
 *
 * This is the one thing the bridge does that the Cloud API cannot do for free:
 * a reminder the day before a booking falls outside WhatsApp's 24-hour service
 * window, so on the official path it needs an approved template. Here it is
 * just the restaurant's own phone sending a message.
 */
export const bridgeNotifier: CustomerNotifier = {
  channel: 'whatsapp_api',
  automatic: true,

  async send(input: NotifyInput): Promise<NotifyResult> {
    const phone = input.reservation.phone;
    if (!phone) return { status: 'skipped' };

    // Prefer the wa_id we have actually seen, because that is the string
    // WhatsApp will route on; fall back to the canonical form for a diner who
    // only ever used the web form.
    const supabase = createAdminClient();
    const e164 = toE164(phone) ?? normalizeWaId(phone);
    const { data } = await supabase
      .from('whatsapp_contacts')
      .select('wa_id')
      .eq('tenant_id', input.tenant.id)
      .eq('phone_e164', e164)
      .maybeSingle();

    const to = (data as { wa_id: string } | null)?.wa_id ?? e164.replace('+', '');

    try {
      const res = await sendViaBridge(input.tenant.id, to, { text: input.body });
      return { status: 'sent', providerId: res.id };
    } catch (err) {
      return { status: 'failed', error: String(err).slice(0, 200) };
    }
  },
};
