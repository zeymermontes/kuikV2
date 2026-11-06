'use server';

import { requireChats } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLid } from '@/lib/phone';
import { isStaffReply } from '@/lib/chats/list';
import { cleanSummary, type PendingCounts } from '@/lib/chats/pendings';
import type { ReservationStatus } from '@/lib/database.types';

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
  /** The branch the chat's number belongs to; null is the main location. */
  branchId: string | null;
  /** What the restaurant still owes this chat: questions to answer, bookings to accept. */
  pending: PendingCounts;
}

type Admin = ReturnType<typeof createAdminClient>;

/** The bookings that wait for a person: asked for and not yet accepted, or asked to be cancelled. */
const BOOKING_WAITS = 'status.eq.pending,cancel_requested_at.not.is.null';

/**
 * What each chat is still owed (migration 0102, and the bookings made
 * through it). A table that is not there yet reads as nothing pending.
 */
async function pendingByChat(admin: Admin, tenantId: string, conversationIds: string[]): Promise<Map<string, PendingCounts>> {
  const out = new Map<string, PendingCounts>();
  if (conversationIds.length === 0) return out;
  const at = (id: string) => {
    let c = out.get(id);
    if (!c) out.set(id, (c = { questions: 0, bookings: 0 }));
    return c;
  };
  const [{ data: questions }, { data: bookings }] = await Promise.all([
    admin.from('whatsapp_pendings').select('conversation_id').eq('tenant_id', tenantId).in('conversation_id', conversationIds).is('done_at', null).limit(500),
    admin
      .from('reservations')
      .select('whatsapp_conversation_id')
      .eq('tenant_id', tenantId)
      .in('whatsapp_conversation_id', conversationIds)
      .or(BOOKING_WAITS)
      .neq('status', 'cancelled')
      .gte('starts_at', new Date(Date.now() - 60 * 60_000).toISOString())
      .limit(500),
  ]);
  for (const q of (questions ?? []) as { conversation_id: string }[]) at(q.conversation_id).questions += 1;
  for (const b of (bookings ?? []) as { whatsapp_conversation_id: string | null }[]) if (b.whatsapp_conversation_id) at(b.whatsapp_conversation_id).bookings += 1;
  return out;
}

const NONE: PendingCounts = { questions: 0, bookings: 0 };

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
    .select('id, branch_id, handoff_at, bot_enabled, last_inbound_at, last_outbound_at, updated_at, contact:whatsapp_contacts(profile_name, phone_e164, wa_id)')
    .eq('tenant_id', tenant.id)
    .order('updated_at', { ascending: false })
    .limit(50);
  if (contactIds) query = query.in('contact_id', contactIds);
  // Waiting for a person always shows, whatever else is true of the chat.
  else query = query.or('status.eq.open,handoff_at.not.is.null');
  const { data } = await query;
  const convs = (data ?? []) as unknown as {
    id: string; branch_id: string | null; handoff_at: string | null; bot_enabled: boolean; last_inbound_at: string | null; last_outbound_at: string | null; updated_at: string;
    contact: { profile_name: string | null; phone_e164: string; wa_id: string } | { profile_name: string | null; phone_e164: string; wa_id: string }[] | null;
  }[];
  if (convs.length === 0) return { rows: [], connected: !!number };

  const { data: msgs } = await admin
    .from('whatsapp_messages')
    .select('conversation_id, body, type, direction, origin, created_at')
    .in('conversation_id', convs.map((c) => c.id))
    .order('created_at', { ascending: false })
    .limit(400);
  const pending = await pendingByChat(admin, tenant.id, convs.map((c) => c.id));
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
        branchId: c.branch_id,
        pending: pending.get(c.id) ?? NONE,
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
    .select('id, branch_id, handoff_at, bot_enabled, last_inbound_at, last_outbound_at, contact:whatsapp_contacts(profile_name, phone_e164)')
    .eq('tenant_id', tenant.id)
    .eq('id', conversationId)
    .maybeSingle();
  const c = data as unknown as {
    id: string; branch_id: string | null; handoff_at: string | null; bot_enabled: boolean; last_inbound_at: string | null; last_outbound_at: string | null;
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
    branchId: c.branch_id,
    pending: (await pendingByChat(admin, tenant.id, [c.id])).get(c.id) ?? NONE,
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
  const { tenant, user } = await requireChats();
  const admin = createAdminClient();
  const { error } = await admin
    .from('whatsapp_conversations')
    .update({ status: 'closed', bot_enabled: true, handoff_at: null, handoff_by: null })
    .eq('id', conversationId)
    .eq('tenant_id', tenant.id);
  // A chat taken off the list is a chat somebody called finished: the
  // questions it was owed go with it. (A booking still to accept does not;
  // that is settled on the booking.)
  if (!error) {
    await admin
      .from('whatsapp_pendings')
      .update({ done_at: new Date().toISOString(), done_by: user.id })
      .eq('tenant_id', tenant.id)
      .eq('conversation_id', conversationId)
      .is('done_at', null)
      .then(() => {}, () => {});
  }
  return { ok: !error };
}

/** One thing a chat is still owed. */
export interface ChatPending {
  /** The pending's id, or the booking's for a booking. */
  id: string;
  kind: 'question' | 'booking';
  /** The question, as it was written down. Empty for a booking: the screen words that. */
  summary: string;
  createdAt: string;
  /** Who wrote a question down. */
  by?: 'bot' | 'staff';
  booking?: {
    id: string;
    name: string;
    party: number;
    date: string;
    time: string;
    status: ReservationStatus;
    /** The diner asked to cancel and waits for the restaurant's answer. */
    cancelRequested: boolean;
  };
}

/**
 * Everything a chat is owed, oldest first: the questions left for a person,
 * then the bookings made through it that wait for a yes or a no. Asked by
 * chat, or by a booking (the chat that booking came through).
 */
export async function listPendings(input: { conversationId?: string | null; reservationId?: string | null }): Promise<{ conversationId: string | null; items: ChatPending[] }> {
  const { tenant } = await requireChats();
  const admin = createAdminClient();

  let conversationId = input.conversationId ?? null;
  if (!conversationId && input.reservationId) {
    const { data } = await admin.from('reservations').select('whatsapp_conversation_id').eq('tenant_id', tenant.id).eq('id', input.reservationId).maybeSingle();
    conversationId = (data as { whatsapp_conversation_id: string | null } | null)?.whatsapp_conversation_id ?? null;
  }
  if (!conversationId) return { conversationId: null, items: [] };

  const [{ data: questions }, { data: bookings }] = await Promise.all([
    admin
      .from('whatsapp_pendings')
      .select('id, summary, created_by, created_at')
      .eq('tenant_id', tenant.id)
      .eq('conversation_id', conversationId)
      .is('done_at', null)
      .order('created_at')
      .limit(20),
    admin
      .from('reservations')
      .select('id, customer_name, party_size, date, time, status, cancel_requested_at, created_at')
      .eq('tenant_id', tenant.id)
      .eq('whatsapp_conversation_id', conversationId)
      .or(BOOKING_WAITS)
      .neq('status', 'cancelled')
      .gte('starts_at', new Date(Date.now() - 60 * 60_000).toISOString())
      .order('starts_at')
      .limit(10),
  ]);

  const items: ChatPending[] = [
    ...((questions ?? []) as { id: string; summary: string; created_by: 'bot' | 'staff'; created_at: string }[]).map((q) => ({
      id: q.id, kind: 'question' as const, summary: q.summary, createdAt: q.created_at, by: q.created_by,
    })),
    ...((bookings ?? []) as { id: string; customer_name: string; party_size: number; date: string; time: string; status: ReservationStatus; cancel_requested_at: string | null; created_at: string }[]).map((b) => ({
      id: b.id, kind: 'booking' as const, summary: '', createdAt: b.created_at,
      booking: { id: b.id, name: b.customer_name, party: b.party_size, date: b.date, time: String(b.time).slice(0, 5), status: b.status, cancelRequested: Boolean(b.cancel_requested_at) },
    })),
  ];
  return { conversationId, items };
}

/** A question was answered: off the list, with who closed it. */
export async function resolvePending(id: string): Promise<{ ok: boolean }> {
  const { tenant, user } = await requireChats();
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('whatsapp_pendings')
    .update({ done_at: new Date().toISOString(), done_by: user.id })
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .is('done_at', null)
    .select('conversation_id');
  const conversationId = (data as { conversation_id: string }[] | null)?.[0]?.conversation_id;
  // The other screens follow the conversation (see leavePending).
  if (conversationId) {
    await admin.from('whatsapp_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId).eq('tenant_id', tenant.id);
  }
  return { ok: !error };
}

/** A person writes a pending down by hand: something to come back to on this chat. */
export async function addPending(conversationId: string, summary: string): Promise<{ ok: boolean }> {
  const { tenant } = await requireChats();
  const text = cleanSummary(summary);
  if (!text) return { ok: false };
  const admin = createAdminClient();
  const { data: conv } = await admin.from('whatsapp_conversations').select('id').eq('id', conversationId).eq('tenant_id', tenant.id).maybeSingle();
  if (!conv) return { ok: false };
  const { leavePending } = await import('@/lib/whatsapp/pendings');
  return leavePending({ tenantId: tenant.id, conversationId }, text, 'staff');
}
