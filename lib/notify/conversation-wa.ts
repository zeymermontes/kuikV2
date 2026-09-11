import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMessage, sendTemplate } from '@/lib/whatsapp/send';
import { WindowClosedError } from '@/lib/whatsapp/window';
import { buildWhatsappUrl } from '@/lib/whatsapp';
import { normalizeWaId, toE164 } from '@/lib/phone';
import type { CustomerNotifier, NotificationKind, NotifyInput, NotifyResult } from './types';

/**
 * The diner already talks to this restaurant on WhatsApp: send the note in
 * that conversation, where it lands in the inbox transcript and a "1"/"2"
 * reply can be matched back to the booking.
 *
 * Free-form while the 24-hour window is open (a linked device has no
 * window); outside it, the approved template for the kind; and when there
 * is none, the one-tap link a staff member sends by hand — so the board
 * still shows a button rather than a silent nothing.
 */

const TEMPLATE_FOR: Record<NotificationKind, string> = {
  confirmed: 'reserva_confirmada',
  cancelled: 'reserva_rechazada',
  reminder_24h: 'recordatorio_reserva_24h',
  waitlist: 'fila_espera',
  table_ready: 'mesa_lista',
};

/** The conversation behind a booking: the one it was made in, else the diner's number. */
export async function conversationForReservation(
  tenantId: string,
  reservation: { id: string; phone: string | null; whatsapp_conversation_id?: string | null },
): Promise<string | null> {
  const supabase = createAdminClient();
  if (reservation.whatsapp_conversation_id) return reservation.whatsapp_conversation_id;
  if (!reservation.phone) return null;
  const e164 = toE164(reservation.phone) ?? normalizeWaId(reservation.phone);
  // The same number can be two contacts (a LID chat resolved later, and a
  // chat the restaurant opened by number): the one seen most recently wins.
  const { data: contact } = await supabase
    .from('whatsapp_contacts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone_e164', e164)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const contactId = (contact as { id: string } | null)?.id;
  if (!contactId) return null;
  const { data: conv } = await supabase
    .from('whatsapp_conversations')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('contact_id', contactId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (conv as { id: string } | null)?.id ?? null;
}

export function conversationNotifier(conversationId: string): CustomerNotifier {
  return {
    channel: 'whatsapp_api',
    automatic: true,

    async send(input: NotifyInput): Promise<NotifyResult> {
      const supabase = createAdminClient();
      // Tie both ways first, so the reply to a reminder finds its booking.
      await Promise.all([
        supabase.from('whatsapp_conversations').update({ reservation_id: input.reservation.id }).eq('id', conversationId),
        supabase.from('reservations').update({ whatsapp_conversation_id: conversationId }).eq('id', input.reservation.id),
      ]);

      try {
        const res = await sendMessage(conversationId, { type: 'text', body: input.body }, 'system');
        if (res.ok) return { status: 'sent', providerId: res.waMessageId };
        if (res.error === 'opted_out') return { status: 'skipped' };
      } catch (err) {
        if (!(err instanceof WindowClosedError)) return { status: 'failed', error: String(err).slice(0, 200) };
      }

      // Window shut (or the send failed): the approved template, if any.
      const tpl = await sendTemplate(conversationId, TEMPLATE_FOR[input.kind], 'es_MX', {
        nombre: input.reservation.customer_name,
        restaurante: input.tenant.name,
        personas: String(input.reservation.party_size),
        fecha: input.reservation.date,
        hora: input.reservation.time.slice(0, 5),
        minutos: String(input.minutes ?? ''),
      });
      if (tpl.ok) return { status: 'sent', providerId: tpl.waMessageId };

      // Nothing automatic left: hand the staff the one-tap link.
      return input.reservation.phone
        ? { status: 'queued', href: buildWhatsappUrl(input.reservation.phone, input.body), error: tpl.error }
        : { status: 'skipped', error: tpl.error };
    },
  };
}
