import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { alertStaff } from '@/lib/alerts';
import { normalizeText } from './parse';
import { sendMessage } from './send';

/**
 * The other half of the 24-hour reminder: understanding the answer.
 *
 * The reminder says "Responde 1 para confirmar o 2 si ya no puedes venir".
 * This intercepts that reply — deterministically, BEFORE flows or AI — and
 * flips the reservation. Guard-railed hard, because a false positive cancels
 * someone's table: it only fires when the conversation is linked to a live
 * future reservation that actually received a reminder recently, and only on
 * an unambiguous yes/no. Anything else falls through to the normal pipeline.
 */

type Admin = ReturnType<typeof createAdminClient>;

const YES = /^(1|si|yes|confirmo|confirmar|confirmado|ahi (estare|estaremos)|claro)\b/;
const NO = /^(2|no( puedo| podre| voy| vamos)?|cancela(r|la)?|cancelen|ya no)\b/;

export async function handleReservationReply(
  supabase: Admin,
  conv: { id: string; tenant_id: string; reservation_id: string | null },
  text: string,
): Promise<boolean> {
  if (!conv.reservation_id) return false;

  const plain = normalizeText(text);
  const yes = YES.test(plain);
  const no = !yes && NO.test(plain);
  if (!yes && !no) return false;

  const { data: resRow } = await supabase
    .from('reservations')
    .select('id, status, starts_at, customer_name, date, time, party_size')
    .eq('id', conv.reservation_id)
    .eq('tenant_id', conv.tenant_id)
    .maybeSingle();
  const reservation = resRow as {
    id: string; status: string; starts_at: string | null;
    customer_name: string; date: string; time: string; party_size: number;
  } | null;

  // Only a live, upcoming booking can be confirmed or released.
  if (!reservation) return false;
  if (!['pending', 'confirmed'].includes(reservation.status)) return false;
  if (reservation.starts_at && new Date(reservation.starts_at).getTime() < Date.now()) return false;

  // And only when a reminder actually went out recently — a bare "no" in an
  // unrelated conversation days later must not cancel a table.
  const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const { data: reminder } = await supabase
    .from('reservation_notifications')
    .select('id')
    .eq('reservation_id', reservation.id)
    .eq('kind', 'reminder_24h')
    .eq('status', 'sent')
    .gte('sent_at', threeDaysAgo)
    .maybeSingle();
  if (!reminder) return false;

  if (yes) {
    await supabase
      .from('reservations')
      .update({ status: 'confirmed' })
      .eq('id', reservation.id)
      .in('status', ['pending', 'confirmed']);
    await sendMessage(conv.id, {
      type: 'text',
      body: `¡Gracias por confirmar! 🎉 Te esperamos el ${reservation.date} a las ${reservation.time}.`,
    }, 'bot');
    // The guest said yes to the reminder: the floor hears it too.
    await alertStaff({
      tenantId: conv.tenant_id,
      roles: ['owner', 'manager', 'host'],
      kind: 'reservation_confirmed',
      es: { title: 'Reservación confirmada por el cliente', body: `${reservation.customer_name} confirmó: ${reservation.date} ${reservation.time.slice(0, 5)}, ${reservation.party_size} personas.` },
      en: { title: 'Reservation confirmed by the guest', body: `${reservation.customer_name} confirmed: ${reservation.date} ${reservation.time.slice(0, 5)}, ${reservation.party_size} people.` },
      tag: `res-confirm-${reservation.id}`,
      url: `/reservations?d=${reservation.date}`,
    });
    return true;
  }

  await supabase
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', reservation.id)
    .in('status', ['pending', 'confirmed']);
  await sendMessage(conv.id, {
    type: 'text',
    body: 'Listo, cancelamos tu reservación 👍 ¡Esperamos verte pronto! Si cambias de planes, aquí estamos.',
  }, 'bot');

  // The table is free again — that's news the floor wants right now.
  await alertStaff({
    tenantId: conv.tenant_id,
    roles: ['owner', 'manager', 'host'],
    kind: 'reservation_cancelled',
    en: { title: 'Reservation released', body: `${reservation.customer_name} canceled: ${reservation.date} ${reservation.time}, ${reservation.party_size} people.` },
    es: { title: 'Reservación liberada', body: `${reservation.customer_name} canceló: ${reservation.date} ${reservation.time}, ${reservation.party_size} personas.` },
    tag: `res-cancel-${reservation.id}`,
    url: `/reservations?d=${reservation.date}`,
  });

  return true;
}
