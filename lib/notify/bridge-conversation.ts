import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveBridgeNumber } from '@/lib/whatsapp/bridge';
import { normalizeWaId, toE164 } from '@/lib/phone';

/**
 * Open (or find) the chat with a diner on the linked device, from their
 * number alone — for someone the restaurant messages FIRST: a walk-in at the
 * door who never wrote to the bot.
 *
 * The address matters more than it looks. WhatsApp identifies most chats by
 * a LID (an opaque id), not the phone number, and a diner who already talked
 * to the bot has a conversation keyed by that LID. So the number is first
 * resolved through the bridge to the address WhatsApp actually uses, and the
 * contact is keyed by THAT — which is how the host's chat and the bot's
 * transcript turn out to be the same conversation. A chat opened earlier
 * under the bare number is folded into it.
 *
 * Null when no linked device is connected or the number cannot be understood.
 */
export async function bridgeConversationFor(tenantId: string, phone: string): Promise<string | null> {
  const e164 = toE164(phone) ?? normalizeWaId(phone);
  if (!e164 || e164.length < 8) return null;

  const supabase = createAdminClient();
  const { data: number } = await supabase
    .from('whatsapp_numbers')
    .select('phone_number_id, branch_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'connected')
    .eq('mode', 'bridge')
    .maybeSingle();
  const num = number as { phone_number_id: string; branch_id: string | null } | null;
  if (!num) return null;

  const digits = e164.replace('+', '');
  // The address WhatsApp routes this number on; the bare digits only when
  // the bridge cannot say (offline, number not on WhatsApp).
  const waId = await resolveBridgeNumber(tenantId, e164).then((r) => r.jid || digits).catch(() => digits);

  // Every contact that is this person: by the resolved address, by the bare
  // number (a chat opened before the address was resolved), by the number
  // itself. The resolved address wins; the rest are folded into it.
  const { data: rows } = await supabase
    .from('whatsapp_contacts')
    .select('id, wa_id, phone_e164, last_seen_at')
    .eq('tenant_id', tenantId)
    .or(`wa_id.eq."${waId}",wa_id.eq."${digits}",phone_e164.eq."${e164}"`);
  const contacts = (rows ?? []) as { id: string; wa_id: string; phone_e164: string; last_seen_at: string | null }[];
  let primary = contacts.find((c) => c.wa_id === waId) ?? null;

  if (!primary) {
    const { data: contact } = await supabase
      .from('whatsapp_contacts')
      .upsert(
        { tenant_id: tenantId, wa_id: waId, phone_e164: e164, last_seen_at: new Date().toISOString() },
        { onConflict: 'tenant_id,wa_id' },
      )
      .select('id, wa_id, phone_e164, last_seen_at')
      .single();
    primary = (contact as typeof primary) ?? null;
  } else if (primary.phone_e164 !== e164) {
    // A LID contact learned its number late (or carried the old fake one).
    await supabase.from('whatsapp_contacts').update({ phone_e164: e164 }).eq('id', primary.id);
  }
  if (!primary) return null;

  const { data: conv } = await supabase
    .from('whatsapp_conversations')
    .upsert(
      { tenant_id: tenantId, phone_number_id: num.phone_number_id, contact_id: primary.id, transport: 'bridge', branch_id: num.branch_id },
      { onConflict: 'phone_number_id,contact_id' },
    )
    .select('id')
    .single();
  const conversationId = (conv as { id: string } | null)?.id ?? null;
  if (!conversationId) return null;

  // Fold the duplicates in: their messages and the bookings that point at
  // them move to the canonical chat, so the transcript is one history.
  const others = contacts.filter((c) => c.id !== primary!.id);
  if (others.length > 0) {
    const { data: dupConvs } = await supabase
      .from('whatsapp_conversations')
      .select('id')
      .eq('tenant_id', tenantId)
      .in('contact_id', others.map((c) => c.id));
    const dupIds = ((dupConvs ?? []) as { id: string }[]).map((c) => c.id).filter((id) => id !== conversationId);
    if (dupIds.length > 0) {
      await Promise.all([
        supabase.from('whatsapp_messages').update({ conversation_id: conversationId }).in('conversation_id', dupIds),
        supabase.from('reservations').update({ whatsapp_conversation_id: conversationId }).in('whatsapp_conversation_id', dupIds),
        supabase.from('whatsapp_conversations').update({ status: 'closed', reservation_id: null }).in('id', dupIds),
      ]);
    }
  }
  return conversationId;
}
