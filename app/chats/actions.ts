'use server';

import { requireChats } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLid } from '@/lib/phone';

export interface ChatRow {
  conversationId: string;
  name: string;
  phone: string | null;
  /** The bot stepped aside and nobody has picked up. */
  waiting: boolean;
  since: string | null;
  lastText: string | null;
  lastAt: string | null;
  lastInbound: boolean;
}

/**
 * The chats app's list: every conversation with a recent message, the ones
 * waiting for a person first. Fifty is a shift's worth; the search box
 * narrows by name or number.
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
    .select('id, handoff_at, last_inbound_at, last_outbound_at, updated_at, contact:whatsapp_contacts(profile_name, phone_e164, wa_id)')
    .eq('tenant_id', tenant.id)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (contactIds) query = query.in('contact_id', contactIds);
  const { data } = await query;
  const convs = (data ?? []) as unknown as {
    id: string; handoff_at: string | null; last_inbound_at: string | null; last_outbound_at: string | null; updated_at: string;
    contact: { profile_name: string | null; phone_e164: string; wa_id: string } | { profile_name: string | null; phone_e164: string; wa_id: string }[] | null;
  }[];
  if (convs.length === 0) return { rows: [], connected: !!number };

  const { data: msgs } = await admin
    .from('whatsapp_messages')
    .select('conversation_id, body, type, direction, created_at')
    .in('conversation_id', convs.map((c) => c.id))
    .order('created_at', { ascending: false })
    .limit(400);
  const lastBy = new Map<string, { body: string | null; type: string; direction: string; created_at: string }>();
  for (const m of (msgs ?? []) as { conversation_id: string; body: string | null; type: string; direction: string; created_at: string }[]) {
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
        since: c.handoff_at,
        lastText: m ? (m.body || (m.type === 'image' ? '📷 Foto' : m.type === 'audio' ? '🎤 Audio' : m.type === 'sticker' ? 'Sticker' : null)) : null,
        lastAt: m?.created_at ?? c.last_inbound_at ?? c.last_outbound_at,
        lastInbound: m?.direction === 'inbound',
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
    .select('id, handoff_at, last_inbound_at, last_outbound_at, contact:whatsapp_contacts(profile_name, phone_e164)')
    .eq('tenant_id', tenant.id)
    .eq('id', conversationId)
    .maybeSingle();
  const c = data as unknown as {
    id: string; handoff_at: string | null; last_inbound_at: string | null; last_outbound_at: string | null;
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
    since: c.handoff_at,
    lastText: null,
    lastAt: c.last_inbound_at ?? c.last_outbound_at,
    lastInbound: false,
  };
}
