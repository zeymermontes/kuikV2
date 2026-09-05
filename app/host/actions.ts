'use server';

import { revalidatePath } from 'next/cache';
import { requireReservations, requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayInTz, nowHHMMInTz } from '@/lib/time';
import { digitsOnly } from '@/lib/utils';
import { setReservationStatus } from '@/app/(dashboard)/reservations/actions';
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
export async function listHostDay(day: string): Promise<HostDay> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  const [{ data: reservations }, { data: tables }, { data: combos }] = await Promise.all([
    supabase.from('reservations').select('*').eq('tenant_id', tenant.id).eq('date', day).order('time', { ascending: true }),
    supabase.from('floor_tables').select('*').eq('tenant_id', tenant.id).order('position', { ascending: true }),
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
}): Promise<Reservation | null> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  const seatNow = !!input.tableIds && input.tableIds.length > 0;
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('reservations')
    .insert({
      tenant_id: tenant.id,
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
  return (data as Reservation) ?? null;
}

/**
 * "Your table is ready" for a waitlist party, as a one-tap WhatsApp link the
 * host opens from the click (a popup only survives inside a click). Marks the
 * party notified so its row changes colour and the timer restarts.
 */
export async function tableReadyLink(id: string): Promise<{ href: string | null }> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  const { data } = await supabase
    .from('reservations')
    .update({ status: 'notified', notified_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .select('customer_name, phone')
    .maybeSingle();
  bump();
  const row = data as { customer_name: string; phone: string | null } | null;
  if (!row?.phone) return { href: null };
  const text =
    tenant.locale === 'en'
      ? `Hi ${row.customer_name}, your table at ${tenant.name} is ready. See you now!`
      : `Hola ${row.customer_name}, tu mesa en ${tenant.name} ya está lista. ¡Te esperamos!`;
  return { href: `https://wa.me/${digitsOnly(row.phone)}?text=${encodeURIComponent(text)}` };
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
        .insert({ tenant_id: tenant.id, ...fields, x: input.x ?? 0, y: input.y ?? 0 })
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
