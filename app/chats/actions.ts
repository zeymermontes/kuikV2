'use server';

import { requireChats } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLid } from '@/lib/phone';
import { isStaffReply } from '@/lib/chats/list';

export interface ChatRow {
  conversationId: string;
  name: string;
  phone: string | null;
  /** The bot stepped aside and nobody has picked up. */
  waiting: boolean;
  /** The bot is the one answering this chat right now. */
  botActive: boolean;
  since: string | null;
  lastText: string | null;
  lastAt: string | null;
  lastInbound: boolean;
  /** The last message is a person's from the restaurant: the diner has their answer. */
  staffReplied: boolean;
}

/**
 * The chats app's list: every conversation with a recent message. Fifty is
 * a shift's worth; the search box narrows by name or number.
 *
 * A chat somebody removed from the list (closeChat) stays out of it until
 * the diner writes again. Searching still finds it: looking a person up by
 * name is how a removed chat is opened again.
 */
export async function listChats(q = ''): Promise<{ rows: ChatRow[]; connected: boolean }> {
  const { tenant } = await requireChats();
  const admin = createAdminClient();

  const { data: number } = await admin
    .from('whatsapp_numbers')
    .select('id')
    .eq('tenant_id', tenant.id)
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle();

  let contactIds: string[] | null = null;
  const needle = q.trim().replace(/[%_,()"'\\]/g, '');
  if (needle) {
    const { data } = await admin
      .from('whatsapp_contacts')
      .select('id')
      .eq('tenant_id', tenant.id)
      .or(`phone_e164.ilike.%${needle}%,profile_name.ilike.%${needle}%`)
      .limit(100);
    contactIds = ((data ?? []) as { id: string }[]).map((c) => c.id);
    if (contactIds.length === 0) return { rows: [], connected: !!number };
  }

  let query = admin
    .from('whatsapp_conversations')
    .select('id, handoff_at, bot_enabled, last_inbound_at, last_outbound_at, updated_at, contact:whatsapp_contacts(profile_name, phone_e164, wa_id)')
    .eq('tenant_id', tenant.id)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (contactIds) query = query.in('contact_id', contactIds);
  // Waiting for a person always shows, whatever else is true of the chat.
  else query = query.or('status.eq.open,handoff_at.not.is.null');
  const { data } = await query;
  const convs = (data ?? []) as unknown as {
    id: string; handoff_at: string | null; bot_enabled: boolean; last_inbound_at: string | null; last_outbound_at: string | null; updated_at: string;
    contact: { profile_name: string | null; phone_e164: string; wa_id: string } | { profile_name: string | null; phone_e164: string; wa_id: string }[] | null;
  }[];
  if (convs.length === 0) return { rows: [], connected: !!number };

  const { data: msgs } = await admin
    .from('whatsapp_messages')
    .select('conversation_id, body, type, direction, origin, created_at')
    .in('conversation_id', convs.map((c) => c.id))
    .order('created_at', { ascending: false })
    .limit(400);
  const lastBy = new Map<string, { body: string | null; type: string; direction: string; origin: string; created_at: string }>();
  for (const m of (msgs ?? []) as { conversation_id: string; body: string | null; type: string; direction: string; origin: string; created_at: string }[]) {
    if (!lastBy.has(m.conversation_id)) lastBy.set(m.conversation_id, m);
  }

  const rows = convs
    .map((c) => {
      const contact = Array.isArray(c.contact) ? c.contact[0] : c.contact;
      const phone = contact?.phone_e164 && !contact.phone_e164.startsWith('lid:') && !isLid(contact.phone_e164.replace('+', '')) ? contact.phone_e164 : null;
      const m = lastBy.get(c.id);
      return {
        conversationId: c.id,
        name: contact?.profile_name || phone || 'Cliente',
        phone,
        waiting: !!c.handoff_at,
        botActive: c.bot_enabled && !c.handoff_at,
        since: c.handoff_at,
        lastText: m ? (m.body || (m.type === 'image' ? '📷 Foto' : m.type === 'audio' ? '🎤 Audio' : m.type === 'sticker' ? 'Sticker' : null)) : null,
        lastAt: m?.created_at ?? c.last_inbound_at ?? c.last_outbound_at,
        lastInbound: m?.direction === 'inbound',
        staffReplied: m ? isStaffReply(m) : false,
      };
    })
    // A chat with no message at all (opened by number, nothing sent yet) is noise here.
    .filter((r) => r.lastAt)
    .sort((a, b) => Number(b.waiting) - Number(a.waiting) || (b.lastAt! > a.lastAt! ? 1 : -1));

  return { rows, connected: !!number };
}

/**
 * One conversation as a list row — for a chat opened by link (a notification
 * tapped) that the first page of the list may not hold.
 */
export async function chatRow(conversationId: string): Promise<ChatRow | null> {
  const { tenant } = await requireChats();
  const admin = createAdminClient();
  const { data } = await admin
    .from('whatsapp_conversations')
    .select('id, handoff_at, bot_enabled, last_inbound_at, last_outbound_at, contact:whatsapp_contacts(profile_name, phone_e164)')
    .eq('tenant_id', tenant.id)
    .eq('id', conversationId)
    .maybeSingle();
  const c = data as unknown as {
    id: string; handoff_at: string | null; bot_enabled: boolean; last_inbound_at: string | null; last_outbound_at: string | null;
    contact: { profile_name: string | null; phone_e164: string } | { profile_name: string | null; phone_e164: string }[] | null;
  } | null;
  if (!c) return null;
  const contact = Array.isArray(c.contact) ? c.contact[0] : c.contact;
  const phone = contact?.phone_e164 && !contact.phone_e164.startsWith('lid:') && !isLid(contact.phone_e164.replace('+', '')) ? contact.phone_e164 : null;
  return {
    conversationId: c.id,
    name: contact?.profile_name || phone || 'Cliente',
    phone,
    waiting: !!c.handoff_at,
    botActive: c.bot_enabled && !c.handoff_at,
    since: c.handoff_at,
    lastText: null,
    lastAt: c.last_inbound_at ?? c.last_outbound_at,
    lastInbound: false,
    staffReplied: false,
  };
}

/**
 * Take a finished chat off the list. Nothing is deleted: the conversation
 * and its messages stay (the admin panel's inbox still shows them), and the
 * chat is back here the moment the diner writes again (lib/whatsapp/inbound.ts).
 *
 * A chat that was waiting for a person stops waiting, which is the point:
 * a handoff used to stay "waiting" until the diner wrote again, so chats
 * settled days ago piled up on top of the ones that do need somebody. It
 * goes back to the bot, like "hand back to the bot" in the chat itself
 * (resumeBot), without answering anything now.
 */
export async function closeChat(conversationId: string): Promise<{ ok: boolean }> {
  const { tenant } = await requireChats();
  const { error } = await createAdminClient()
    .from('whatsapp_conversations')
    .update({ status: 'closed', bot_enabled: true, handoff_at: null, handoff_by: null })
    .eq('id', conversationId)
    .eq('tenant_id', tenant.id);
  return { ok: !error };
}
