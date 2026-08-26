'use server';

import { revalidatePath } from 'next/cache';
import { requireReservations, requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { revalidateTenant } from '@/lib/revalidate';
import { createReservation, type CreateReservationResult } from '@/lib/reservations/create';
import { getNotifier, renderNotification } from '@/lib/notify';
import type {
  Reservation, ReservationArea, ReservationStatus, ReservationNotification,
} from '@/lib/database.types';

/**
 * Move a booking along, and queue a note to the diner when the outcome is one
 * they care about.
 *
 * Returns the wa.me link rather than opening it: a popup only survives if the
 * browser can tie it to the click that started it, so the component has to do
 * the opening.
 */
export async function setReservationStatus(
  id: string,
  status: ReservationStatus,
): Promise<{
  /** A one-tap wa.me link, when a human still has to press send. */
  href?: string;
  notificationId?: string;
  /** True when the message already went out on its own. */
  sent?: boolean;
}> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('reservations')
    .update({ status })
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .select('id, customer_name, phone, party_size, date, time');

  revalidatePath('/reservations');

  const reservation = rows?.[0] as Reservation | undefined;
  const kind = status === 'confirmed' ? 'confirmed' : status === 'cancelled' ? 'cancelled' : null;
  if (!reservation || !kind) return {};

  const body = renderNotification(kind, tenant.locale, {
    restaurant: tenant.name,
    name: reservation.customer_name,
    party: reservation.party_size,
    date: reservation.date,
    time: reservation.time,
  });

  const input = { tenant, reservation, kind, body } as const;
  const notifier = await getNotifier(input);
  const result = await notifier.send(input);
  if (result.status === 'skipped') return {};

  // `unique (reservation_id, kind)` makes this safe to repeat: flipping a
  // booking confirmed twice queues one note, not two.
  const { data: note } = await supabase
    .from('reservation_notifications')
    .upsert(
      {
        tenant_id: tenant.id,
        reservation_id: reservation.id,
        kind,
        channel: notifier.channel,
        status: notifier.automatic ? 'sent' : 'queued',
        body,
        sent_at: notifier.automatic ? new Date().toISOString() : null,
      },
      { onConflict: 'reservation_id,kind' },
    )
    .select('id')
    .maybeSingle();

  return {
    href: result.href,
    notificationId: (note as { id: string } | null)?.id,
    sent: result.status === 'sent',
  };
}

/** Mark a manually-sent note as delivered, once the staff member opened it. */
export async function markNotificationSent(id: string): Promise<void> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  await supabase
    .from('reservation_notifications')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', tenant.id);
  revalidatePath('/reservations');
}

/** Notes still waiting for someone to press send, for one day. */
export async function listPendingNotifications(day: string): Promise<ReservationNotification[]> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  const { data } = await supabase
    .from('reservation_notifications')
    .select('*, reservations!inner(date)')
    .eq('tenant_id', tenant.id)
    .eq('status', 'queued')
    .eq('reservations.date', day);
  return (data ?? []) as ReservationNotification[];
}

/** Re-read one day. Used by the refresh button and after a realtime reconnect. */
export async function listDayReservations(day: string): Promise<Reservation[]> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();
  const { data } = await supabase
    .from('reservations')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('date', day)
    .order('time', { ascending: true });
  return (data ?? []) as Reservation[];
}

/**
 * Book a table from the dashboard — the phone rang, or someone walked in.
 *
 * Runs on the staff member's own session, which is what tells the RPC they may
 * book a time that has already passed and may override a full slot.
 */
export async function createReservationAction(input: {
  customer_name: string;
  phone?: string | null;
  party_size: number;
  date: string;
  time: string;
  note?: string | null;
  area_id?: string | null;
  branch_id?: string | null;
  source?: 'manual' | 'phone';
  force?: boolean;
}): Promise<CreateReservationResult> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();

  const result = await createReservation(supabase, {
    tenantId: tenant.id,
    branchId: input.branch_id ?? null,
    areaId: input.area_id ?? null,
    customerName: input.customer_name,
    phone: input.phone ?? null,
    partySize: input.party_size,
    date: input.date,
    time: input.time,
    note: input.note ?? null,
    source: input.source ?? 'manual',
    force: input.force ?? false,
  });

  if (result.ok) revalidatePath('/reservations');
  return result;
}

// ── Settings (manager+) ─────────────────────────────────────────────────────
// These write tenant_contact, whose RLS is owner/manager. Guarding here means a
// waiter gets redirected instead of watching a switch move and save nothing.

export async function toggleReservations(enabled: boolean): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('tenant_contact').update({ reservations_enabled: enabled }).eq('tenant_id', tenant.id);
  revalidatePath('/reservations');
  revalidateTenant(tenant.subdomain);
}

export async function setReservationRequired(
  required: { name?: boolean; phone?: boolean; party?: boolean; note?: boolean },
): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('tenant_contact').update({ reservation_required: required }).eq('tenant_id', tenant.id);
  revalidatePath('/reservations');
  revalidateTenant(tenant.subdomain);
}

export async function setReservationPolicy(policy: {
  reservation_slot_minutes?: number;
  reservation_max_party?: number;
  reservation_lead_minutes?: number;
  reservation_max_days?: number;
  reservation_auto_confirm?: boolean;
}): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('tenant_contact').update(policy).eq('tenant_id', tenant.id);
  revalidatePath('/reservations');
  revalidateTenant(tenant.subdomain);
}

// ── Areas ───────────────────────────────────────────────────────────────────

export async function saveArea(input: {
  id?: string | null;
  name: string;
  max_covers: number | null;
  public_bookable: boolean;
  position?: number;
}): Promise<ReservationArea | null> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const name = input.name.trim();
  if (!name) return null;

  const fields = {
    name,
    max_covers: input.max_covers ?? null,
    public_bookable: input.public_bookable,
  };

  const { data } = input.id
    ? await supabase.from('reservation_areas').update(fields)
        .eq('id', input.id).eq('tenant_id', tenant.id).select('*').single()
    : await supabase.from('reservation_areas')
        .insert({ tenant_id: tenant.id, ...fields, position: input.position ?? 0 })
        .select('*').single();

  revalidatePath('/reservations');
  revalidateTenant(tenant.subdomain);
  return (data as ReservationArea) ?? null;
}

export async function deleteArea(id: string): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  // Existing bookings keep their row; area_id is ON DELETE SET NULL, so a
  // deleted room does not take the night's reservations with it.
  await supabase.from('reservation_areas').delete().eq('id', id).eq('tenant_id', tenant.id);
  revalidatePath('/reservations');
  revalidateTenant(tenant.subdomain);
}

// ── Pending across every upcoming day ───────────────────────────────────────
// The board is scoped to one day, which is right during service but hides the
// thing that actually needs a human: a request nobody has looked at yet, for a
// date that is not today.

export interface PendingSummary {
  total: number;
  /** Grouped by day, soonest first, so one tap goes to the right screen. */
  days: { date: string; count: number }[];
}

/**
 * Requests still waiting on a yes or no, from now on.
 *
 * Filtered on `starts_at` rather than `date`, so "upcoming" means upcoming AT
 * THE RESTAURANT — a booking for 21:00 tonight is still pending at 20:00, and
 * comparing dates in UTC would have dropped it.
 */
export async function getPendingSummary(): Promise<PendingSummary> {
  const { tenant } = await requireReservations();
  const supabase = await createClient();

  const { data } = await supabase
    .from('reservations')
    .select('date')
    .eq('tenant_id', tenant.id)
    .eq('status', 'pending')
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true });

  const rows = (data ?? []) as { date: string }[];
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.date, (byDay.get(r.date) ?? 0) + 1);

  return {
    total: rows.length,
    days: [...byDay.entries()]
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  };
}
