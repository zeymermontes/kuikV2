'use server';

import { revalidatePath } from 'next/cache';
import { branchFilter } from '@/lib/branches';
import { requireReservations, requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayInTz, nowHHMMInTz } from '@/lib/time';
import { digitsOnly } from '@/lib/utils';
import { setReservationStatus } from '@/app/(dashboard)/reservations/actions';
import { createAdminClient } from '@/lib/supabase/admin';
import { notifyGuest, type GuestNotice } from '@/lib/notify/guest';
import { conversationForReservation } from '@/lib/notify/conversation-wa';
import { bridgeConversationFor } from '@/lib/notify/bridge-conversation';
import { sendMessage } from '@/lib/whatsapp/send';
import { isWindowOpen, WindowClosedError } from '@/lib/whatsapp/window';
import type { MessageOrigin } from '@/lib/whatsapp/types';
import type {
  FloorTable, FloorCombination, Reservation, ReservationShift, ReservationStatus, TableShape, TableStatus,
} from '@/lib/database.types';

// The host stand's writes. Everything here runs on the staff member's own
// session, so RLS (can_manage_reservations for parties and server sections,
// can_manage_menu for drawing the plan) is the real gate; the guards only
// turn people away politely.

export interface HostDay {
  reservations: Reservation[];
  tables: FloorTable[];
  combos: FloorCombination[];
}

function bump() {
  revalidatePath('/host');
  revalidatePath('/reservations');
}

/** One day's book plus the floor plan. */
export async function listHostDay(day: string, branchId: string | null = null): Promise<HostDay> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  const [{ data: reservations }, { data: tables }, { data: combos }] = await Promise.all([
    branchFilter(supabase.from('reservations').select('*').eq('tenant_id', tenant.id).eq('date', day), branchId).order('time', { ascending: true }),
    branchFilter(supabase.from('floor_tables').select('*').eq('tenant_id', tenant.id), branchId).order('position', { ascending: true }),
    supabase.from('floor_combinations').select('*').eq('tenant_id', tenant.id),
  ]);
  return {
    reservations: (reservations ?? []) as Reservation[],
    tables: (tables ?? []) as FloorTable[],
    combos: (combos ?? []) as FloorCombination[],
  };
}

/**
 * Move a party along. Stamps the matching timestamp and, for the two outcomes
 * the diner is told about (confirmed, cancelled), goes through the book's own
 * action so the WhatsApp notice is queued exactly as before.
 */
export async function setPartyStatus(
  id: string,
  status: ReservationStatus,
  opts: { tableIds?: string[]; serverName?: string | null } = {},
): Promise<{ href?: string; notificationId?: string }> {
  if (status === 'confirmed' || status === 'cancelled') {
    const r = await setReservationStatus(id, status);
    bump();
    return r;
  }
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status };
  if (status === 'arrived' || status === 'partial') patch.arrived_at = now;
  if (status === 'seated') {
    patch.seated_at = now;
    patch.table_status = 'seated';
    patch.finished_at = null;
    if (opts.tableIds) patch.table_ids = opts.tableIds;
    if (opts.serverName !== undefined) patch.server_name = opts.serverName;
  }
  if (status === 'finished') patch.finished_at = now;
  if (status === 'notified') patch.notified_at = now;
  await supabase.from('reservations').update(patch).eq('id', id).eq('tenant_id', tenant.id);
  bump();
  return {};
}

export async function setTableStatus(id: string, tableStatus: TableStatus): Promise<void> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  await supabase.from('reservations').update({ table_status: tableStatus }).eq('id', id).eq('tenant_id', tenant.id);
  bump();
}

/** Assign or move a party's tables without touching its status. */
export async function moveParty(id: string, tableIds: string[]): Promise<void> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  await supabase.from('reservations').update({ table_ids: tableIds }).eq('id', id).eq('tenant_id', tenant.id);
  bump();
}

export interface PartyFields {
  customer_name?: string;
  phone?: string | null;
  party_size?: number;
  note?: string | null;
  tags?: string[];
  /** "YYYY-MM-DD": moving a booking to another day from the door. */
  date?: string;
  time?: string;
  area_id?: string | null;
  quoted_minutes?: number | null;
  turn_minutes?: number | null;
  server_name?: string | null;
}

export async function updateParty(id: string, fields: PartyFields): Promise<void> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  await supabase.from('reservations').update(fields).eq('id', id).eq('tenant_id', tenant.id);
  bump();
}

/**
 * Someone at the door with no booking. Either onto the waitlist with a quote,
 * or straight to a table. Inserted directly rather than through the booking
 * RPC: walk-ins are exempt from every public rule by definition.
 *
 * A party that waits and left a number is told so right away ("you're on
 * the waitlist, about N minutes"), on whatever channel the restaurant has.
 */
export async function addWalkIn(input: {
  name: string;
  phone?: string | null;
  party: number;
  note?: string | null;
  quotedMinutes?: number | null;
  tableIds?: string[];
  tags?: string[];
  areaId?: string | null;
  /** The stand's branch; null is the main location. */
  branchId?: string | null;
}): Promise<{ party: Reservation; notice: GuestNotice | null } | null> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  const seatNow = !!input.tableIds && input.tableIds.length > 0;
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('reservations')
    .insert({
      tenant_id: tenant.id,
      branch_id: input.branchId ?? null,
      area_id: input.areaId ?? null,
      customer_name: input.name.trim() || 'Walk-in',
      phone: input.phone?.trim() || null,
      party_size: Math.max(1, input.party),
      date: todayInTz(tenant.timezone),
      time: nowHHMMInTz(tenant.timezone),
      note: input.note?.trim() || null,
      source: 'walkin',
      status: seatNow ? 'seated' : 'waiting',
      quoted_minutes: seatNow ? null : (input.quotedMinutes ?? null),
      table_ids: input.tableIds ?? [],
      table_status: 'seated',
      arrived_at: now,
      seated_at: seatNow ? now : null,
      tags: input.tags ?? [],
    })
    .select('*')
    .single();
  bump();
  const party = (data as Reservation) ?? null;
  if (!party) return null;

  let notice: GuestNotice | null = null;
  if (!seatNow && party.phone) {
    notice = await notifyGuest({ tenant, reservation: party, kind: 'waitlist', minutes: party.quoted_minutes }).catch(() => null);
  }
  return { party, notice };
}

/**
 * "Your table is ready" for a waitlist party. Goes out on its own when the
 * restaurant has WhatsApp connected; otherwise comes back as the one-tap link
 * the host opens. Marks the party notified so its row changes colour and the
 * timer restarts.
 */
export async function notifyTableReady(id: string): Promise<GuestNotice> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  const { data } = await supabase
    .from('reservations')
    .update({ status: 'notified', notified_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .select('id, customer_name, phone, party_size, date, time, whatsapp_conversation_id')
    .maybeSingle();
  bump();
  const row = data as Pick<Reservation, 'id' | 'customer_name' | 'phone' | 'party_size' | 'date' | 'time' | 'whatsapp_conversation_id'> | null;
  if (!row || (!row.phone && !row.whatsapp_conversation_id)) return { status: 'skipped' };
  return notifyGuest({ tenant, reservation: row, kind: 'table_ready' });
}

// ── The chat with a party ───────────────────────────────────────────────────

export interface PartyChatMessage {
  id: string;
  wa_message_id: string | null;
  direction: 'inbound' | 'outbound';
  origin: MessageOrigin;
  type: string;
  body: string | null;
  media_url: string | null;
  media_mime: string | null;
  /** The wa_message_id this one quotes, when it is a reply. */
  replied_to_wa_id: string | null;
  status: string | null;
  created_at: string;
}

export interface PartyChat {
  conversationId: string | null;
  messages: PartyChatMessage[];
  /** False while the bot is paused (a person took the chat). */
  botActive: boolean;
  /** Whether a free-form reply can go out right now. */
  canReply: boolean;
  /** Why not, when it can't. */
  reason: 'no_conversation' | 'window_closed' | null;
  /** The one-tap link to answer from a phone instead. */
  href: string | null;
}

/**
 * The WhatsApp conversation behind a party, for the stand: the transcript,
 * whether the bot is talking, and whether the host can answer from here.
 * A walk-in the restaurant has never chatted with gets a chat opened on the
 * linked device, so the first message can be the host's.
 */
export async function getPartyChat(reservationId: string): Promise<PartyChat> {
  const { tenant } = await requireReservations();
  const admin = createAdminClient();
  const { data } = await admin
    .from('reservations')
    .select('id, phone, whatsapp_conversation_id')
    .eq('id', reservationId)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  const party = data as { id: string; phone: string | null; whatsapp_conversation_id: string | null } | null;
  const empty: PartyChat = { conversationId: null, messages: [], botActive: true, canReply: false, reason: 'no_conversation', href: null };
  if (!party) return empty;
  const href = party.phone ? `https://wa.me/${digitsOnly(party.phone)}` : null;

  // The linked device knows the address this number chats under, and folds
  // a chat opened by bare number into the one the bot already has — so ask
  // it first; the booking's own link is the answer when there is no device.
  let conversationId = party.phone ? await bridgeConversationFor(tenant.id, party.phone) : null;
  if (!conversationId) conversationId = await conversationForReservation(tenant.id, party);
  if (!conversationId) return { ...empty, href };

  if (party.whatsapp_conversation_id !== conversationId) {
    await admin.from('reservations').update({ whatsapp_conversation_id: conversationId }).eq('id', party.id);
  }

  const [{ data: conv }, { data: rows }] = await Promise.all([
    admin.from('whatsapp_conversations').select('id, transport, window_expires_at, bot_enabled, handoff_at').eq('id', conversationId).eq('tenant_id', tenant.id).maybeSingle(),
    admin
      .from('whatsapp_messages')
      .select('id, wa_message_id, direction, origin, type, body, media_url, media_mime, replied_to_wa_id, status, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  const c = conv as { transport: 'cloud' | 'bridge'; window_expires_at: string | null; bot_enabled: boolean; handoff_at: string | null } | null;
  if (!c) return { ...empty, href };
  const canReply = c.transport === 'bridge' || isWindowOpen(c);
  return {
    conversationId,
    messages: ((rows ?? []) as PartyChatMessage[]).reverse(),
    botActive: c.bot_enabled && !c.handoff_at,
    canReply,
    reason: canReply ? null : 'window_closed',
    href,
  };
}

/**
 * A host answering a diner from the stand. The bot steps aside on the first
 * reply so it doesn't talk over a person; the stand can hand the chat back.
 */
export async function sendPartyMessage(conversationId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const { tenant } = await requireReservations();
  const text = body.trim();
  if (!text) return { ok: false, error: 'empty' };
  const admin = createAdminClient();
  const { data } = await admin.from('whatsapp_conversations').select('id').eq('id', conversationId).eq('tenant_id', tenant.id).maybeSingle();
  if (!data) return { ok: false, error: 'unknown_conversation' };
  try {
    const res = await sendMessage(conversationId, { type: 'text', body: text }, 'staff_dashboard');
    if (!res.ok) return { ok: false, error: res.error ?? 'send_failed' };
  } catch (err) {
    return { ok: false, error: err instanceof WindowClosedError ? 'window_closed' : 'send_failed' };
  }
  await admin
    .from('whatsapp_conversations')
    .update({ bot_enabled: false, handoff_at: new Date().toISOString(), handoff_by: 'staff_dashboard' })
    .eq('id', conversationId)
    .eq('tenant_id', tenant.id)
    .is('handoff_at', null);
  return { ok: true };
}

/** Hand a party's chat back to the bot, or take it away. */
export async function setPartyChatBot(conversationId: string, enabled: boolean): Promise<void> {
  const { tenant } = await requireReservations();
  const admin = createAdminClient();
  await admin
    .from('whatsapp_conversations')
    .update(
      enabled
        ? { bot_enabled: true, handoff_at: null, handoff_by: null }
        : { bot_enabled: false, handoff_at: new Date().toISOString(), handoff_by: 'staff_dashboard' },
    )
    .eq('id', conversationId)
    .eq('tenant_id', tenant.id);
}

// ── Floor plan ─────────────────────────────────────────────────────────────

export async function saveTable(input: {
  id?: string | null;
  label: string;
  seats: number;
  shape: TableShape;
  area_id: string | null;
  x?: number;
  y?: number;
  branchId?: string | null;
}): Promise<FloorTable | null> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const fields = {
    label: input.label.trim(),
    seats: Math.max(1, input.seats),
    shape: input.shape,
    area_id: input.area_id,
    updated_at: new Date().toISOString(),
  };
  if (!fields.label) return null;
  const { data } = input.id
    ? await supabase.from('floor_tables').update(fields).eq('id', input.id).eq('tenant_id', tenant.id).select('*').single()
    : await supabase
        .from('floor_tables')
        .insert({ tenant_id: tenant.id, branch_id: input.branchId ?? null, ...fields, x: input.x ?? 0, y: input.y ?? 0 })
        .select('*')
        .single();
  bump();
  return (data as FloorTable) ?? null;
}

export async function moveTable(id: string, x: number, y: number): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase
    .from('floor_tables')
    .update({ x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)), updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  bump();
}

export async function deleteTable(id: string): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('floor_tables').delete().eq('id', id).eq('tenant_id', tenant.id);
  bump();
}

/** Server sections: the host stand assigns who works which table. */
export async function setTableServer(id: string, name: string | null): Promise<void> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  await supabase
    .from('floor_tables')
    .update({ server_name: name?.trim() || null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  bump();
}

/** Keep a table on the plan but out of play until `until` (ISO); null lifts the block. */
export async function blockTable(id: string, until: string | null): Promise<void> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  await supabase
    .from('floor_tables')
    .update({ blocked_until: until, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  bump();
}

/** Tables that push together for a bigger party (manager+). */
export async function saveCombination(input: { tableIds: string[]; seats: number; areaId: string | null }): Promise<FloorCombination | null> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  if (input.tableIds.length < 2) return null;
  const { data } = await supabase
    .from('floor_combinations')
    .insert({ tenant_id: tenant.id, table_ids: input.tableIds, seats: Math.max(1, input.seats), area_id: input.areaId })
    .select('*')
    .single();
  bump();
  return (data as FloorCombination) ?? null;
}

export async function deleteCombination(id: string): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('floor_combinations').delete().eq('id', id).eq('tenant_id', tenant.id);
  bump();
}

// ── Settings (manager+) ────────────────────────────────────────────────────

export async function saveHostSettings(input: {
  shifts?: ReservationShift[] | null;
  turns?: Record<string, number> | null;
  late?: number;
}): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  if (input.shifts !== undefined) patch.reservation_shifts = input.shifts;
  if (input.turns !== undefined) patch.reservation_turn_minutes = input.turns;
  if (input.late !== undefined) patch.reservation_late_minutes = Math.max(0, input.late);
  await supabase.from('tenant_contact').update(patch).eq('tenant_id', tenant.id);
  bump();
}
