// The list of every booking, as the host stand and the chats app both show
// it (components/reservations/BookingsList.tsx). Pure: what counts as
// upcoming, and the order, are decided here and tested.

import { addDays } from '@/lib/time';

export type BookingsFilter = 'upcoming' | 'past' | 'all';

/**
 * A booking stays "upcoming" for an hour after its time. At 8:01 the party
 * booked for 8:00 is very much still expected (arriving, being seated, or
 * late), and a list that drops it on the minute hides exactly the bookings
 * the door is dealing with.
 */
export const PAST_AFTER_MS = 60 * 60_000;

export interface ListedBooking {
  /** The absolute instant the booking is for (reservations.starts_at). */
  starts_at: string;
}

export function isPast(startsAt: string, now: number): boolean {
  const at = Date.parse(startsAt);
  // A booking whose time cannot be read is shown, not buried.
  if (!Number.isFinite(at)) return false;
  return now - at > PAST_AFTER_MS;
}

/** Where the server draws the same line, as the instant to compare starts_at with. */
export function pastCutoff(now: number): string {
  return new Date(now - PAST_AFTER_MS).toISOString();
}

/**
 * Nearest first, both ways: upcoming bookings from the soonest on, past ones
 * from the latest back. "All" is the two in that order, so the top of the
 * list is always what is about to happen.
 */
export function splitBookings<T extends ListedBooking>(rows: T[], now: number): { upcoming: T[]; past: T[] } {
  const upcoming: T[] = [];
  const past: T[] = [];
  for (const r of rows) (isPast(r.starts_at, now) ? past : upcoming).push(r);
  const at = (r: T) => Date.parse(r.starts_at) || 0;
  upcoming.sort((a, b) => at(a) - at(b));
  past.sort((a, b) => at(b) - at(a));
  return { upcoming, past };
}

export function bookingsFor<T extends ListedBooking>(rows: T[], filter: BookingsFilter, now: number): T[] {
  const { upcoming, past } = splitBookings(rows, now);
  return filter === 'upcoming' ? upcoming : filter === 'past' ? past : [...upcoming, ...past];
}

/** How a day is named next to today: 'today', 'tomorrow', 'yesterday', or null for any other. */
export function relativeDay(day: string, today: string): 'today' | 'tomorrow' | 'yesterday' | null {
  if (day === today) return 'today';
  if (day === addDays(today, 1)) return 'tomorrow';
  if (day === addDays(today, -1)) return 'yesterday';
  return null;
}
