// Which bookings belong to a chat. Pure, so the matching is tested and not
// eyeballed against whatever phone formats the tables happen to hold.

import type { ReservationStatus } from '@/lib/database.types';

/** The statuses of a booking that is still ahead of the restaurant: asked for, or accepted. */
export const LIVE_STATUSES: ReservationStatus[] = ['pending', 'confirmed'];

/**
 * The last ten digits of a phone, or null when there are not enough to tell
 * a person apart. Ten is a national number in Mexico; what comes before it
 * (+52, 521, a space) is written a dozen ways across the tables.
 */
export function phoneTail(phone: string | null | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.slice(-10);
}

/** Whether a booking was made by this phone, however either side wrote the number. */
export function samePhone(a: string | null | undefined, b: string | null | undefined): boolean {
  const ta = phoneTail(a);
  const tb = phoneTail(b);
  return Boolean(ta && tb && ta === tb);
}

/**
 * A booking a chat should still show: asked for or accepted, and not more
 * than an hour past its time (a late party is still a party).
 */
export function isUpcoming(r: { status: ReservationStatus; starts_at: string }, now: number = Date.now()): boolean {
  if (!LIVE_STATUSES.includes(r.status)) return false;
  return new Date(r.starts_at).getTime() >= now - 60 * 60_000;
}

/**
 * The bookings of a chat: the ones made through it, plus the ones booked
 * under the same number by any other way (the host, the panel, the menu).
 * Nearest first.
 */
export function bookingsOfChat<T extends { id: string; status: ReservationStatus; starts_at: string; phone: string | null; whatsapp_conversation_id?: string | null }>(
  rows: T[],
  chat: { conversationId: string; phone: string | null },
  now: number = Date.now(),
): T[] {
  return rows
    .filter((r) => isUpcoming(r, now) && ((r.whatsapp_conversation_id ?? null) === chat.conversationId || samePhone(r.phone, chat.phone)))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
