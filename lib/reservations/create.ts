import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { sendToTenant } from '@/lib/push/send';
import type { ReservationSource } from '@/lib/database.types';

/**
 * The one way a reservation gets created.
 *
 * Three callers need it — the public menu form, a staff member in the
 * dashboard, and (later) the WhatsApp bot — and they must not each re-implement
 * the rules. The rules themselves live in the `request_reservation` Postgres
 * function, because that is the only place a capacity check can hold a lock;
 * this module is the typed door to it, plus the seam where notifications get
 * hung once there is a channel to send them on.
 */

export interface CreateReservationInput {
  tenantId: string;
  branchId?: string | null;
  areaId?: string | null;
  customerName: string;
  phone?: string | null;
  partySize: number;
  /** Local calendar date, "YYYY-MM-DD". */
  date: string;
  /** Local wall-clock time, "HH:MM". */
  time: string;
  note?: string | null;
  source?: ReservationSource;
  /** Staff only: book anyway despite a full slot. */
  force?: boolean;
}

/** Every way the booking can be refused, as a stable code the UI can translate. */
export type ReservationError =
  | 'not_enabled'
  | 'missing_fields'
  | 'phone_required'
  | 'note_required'
  | 'party_out_of_range'
  | 'too_soon'
  | 'too_far'
  | 'slot_full'
  | 'not_allowed'
  | 'unknown_tenant'
  | 'failed';

export type CreateReservationResult =
  | { ok: true; id: string }
  | { ok: false; error: ReservationError };

const KNOWN_ERRORS: ReservationError[] = [
  'not_enabled', 'missing_fields', 'phone_required', 'note_required',
  'party_out_of_range', 'too_soon', 'too_far', 'slot_full',
  'not_allowed', 'unknown_tenant',
];

/**
 * The RPC signals refusals with `raise exception '<code>'`, which reaches
 * supabase-js as a message string. Anything we don't recognise is a genuine
 * fault and must not be shown to a diner as if it were their mistake.
 */
function toError(message: string | undefined): ReservationError {
  const found = KNOWN_ERRORS.find((code) => (message ?? '').includes(code));
  return found ?? 'failed';
}

/**
 * `supabase` decides who the caller is, and the RPC reads that:
 *   - service-role client (public form, bot) → treated as the public: every
 *     setting is enforced, the booking lands as `pending`.
 *   - a signed-in staff session → may book the past and may override capacity.
 * Passing the wrong client is therefore a real privilege decision, not a detail.
 */
export async function createReservation(
  supabase: SupabaseClient,
  input: CreateReservationInput,
): Promise<CreateReservationResult> {
  const { data, error } = await supabase.rpc('request_reservation', {
    p_tenant: input.tenantId,
    p_branch: input.branchId ?? null,
    p_area: input.areaId ?? null,
    p_name: input.customerName,
    p_phone: input.phone ?? null,
    p_party: input.partySize,
    p_date: input.date,
    p_time: input.time,
    p_note: input.note ?? null,
    p_source: input.source ?? 'form',
    p_force: input.force ?? false,
  });

  if (error) return { ok: false, error: toError(error.message) };
  if (typeof data !== 'string') return { ok: false, error: 'failed' };

  // Tell whoever works the door. Only for bookings the restaurant didn't make
  // itself — pushing a staff member about the booking they just typed in is
  // noise. Awaited but never allowed to fail the booking.
  if ((input.source ?? 'form') !== 'manual') {
    await notifyStaff(input, data).catch(() => {});
  }

  return { ok: true, id: data };
}

async function notifyStaff(input: CreateReservationInput, id: string): Promise<void> {
  await sendToTenant(
    input.tenantId,
    ['owner', 'manager', 'cashier', 'host'],
    (locale) => {
      // Built per subscription so each device reads it in its owner's language.
      const t = MESSAGES[locale === 'en' ? 'en' : 'es'];
      return {
        title: t.title,
        body: t.body(input.customerName, input.partySize, input.date, input.time),
        tag: `res-${id}`,
        url: `/reservations?d=${input.date}`,
        data: { reservationId: id },
        actions: [
          { action: 'confirm', title: t.confirm },
          { action: 'cancel', title: t.decline },
        ],
      };
    },
  );
}

/**
 * Deliberately not next-intl: this runs inside a fire-and-forget path that may
 * outlive the request's locale context, and pulling a full translator per
 * subscription would be heavier than the two strings involved.
 */
const MESSAGES = {
  es: {
    title: 'Nueva reservación',
    confirm: 'Confirmar',
    decline: 'Rechazar',
    body: (name: string, party: number, date: string, time: string) =>
      `${name} · ${party} personas · ${date} a las ${time}`,
  },
  en: {
    title: 'New reservation',
    confirm: 'Confirm',
    decline: 'Decline',
    body: (name: string, party: number, date: string, time: string) =>
      `${name} · ${party} guests · ${date} at ${time}`,
  },
} as const;
