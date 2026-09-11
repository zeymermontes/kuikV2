import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeWaId, toE164 } from '@/lib/phone';

/**
 * Open (or find) the chat with a diner on the linked device, from their
 * number alone — for someone the restaurant messages FIRST: a walk-in at the
 * door who never wrote to the bot.
 *
 * Creating the conversation instead of firing a bare bridge send means the
 * note lands in a transcript, the host can read the reply and answer from
 * the stand, and a later "1"/"2" finds its booking. Null when no linked
 * device is connected or the number cannot be understood.
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

  // A chat this number already has (whatever wa_id WhatsApp gave it) beats
  // opening a second one.
  const { data: known } = await supabase
    .from('whatsapp_contacts')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('phone_e164', e164)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  let contactId = (known as { id: string } | null)?.id ?? null;

  if (!contactId) {
    const { data: contact } = await supabase
      .from('whatsapp_contacts')
      .upsert(
        { tenant_id: tenantId, wa_id: e164.replace('+', ''), phone_e164: e164, last_seen_at: new Date().toISOString() },
        { onConflict: 'tenant_id,wa_id' },
      )
      .select('id')
      .single();
    contactId = (contact as { id: string } | null)?.id ?? null;
  }
  if (!contactId) return null;

  const { data: conv } = await supabase
    .from('whatsapp_conversations')
    .upsert(
      { tenant_id: tenantId, phone_number_id: num.phone_number_id, contact_id: contactId, transport: 'bridge', branch_id: num.branch_id },
      { onConflict: 'phone_number_id,contact_id' },
    )
    .select('id')
    .single();
  return (conv as { id: string } | null)?.id ?? null;
}
