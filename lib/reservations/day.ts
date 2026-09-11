// Whether a restaurant can take a booking on a given day — the pure half.
//
// The booking RPC (`request_reservation`) is the authority at the moment of
// booking; this answers the same question EARLIER, when a diner names a
// date, so the bot can say "that day we're closed" or "that day is full"
// instead of collecting time and name first and refusing at the end.

import type { DayHours, WeekHours } from '@/lib/hours';
import { addDays } from '@/lib/time';

export type DayUnavailableReason = 'not_enabled' | 'past' | 'too_far' | 'closed' | 'full';
export type DayStatus = { ok: true } | { ok: false; reason: DayUnavailableReason };

export interface DayAvailabilityInput {
  /** "YYYY-MM-DD", the restaurant's calendar. */
  date: string;
  today: string;
  enabled: boolean;
  maxDays: number;
  slotMinutes: number;
  hours: WeekHours | null;
  /** Public areas with a cap; an area with `maxCovers` null never fills. */
  areas: { id: string; maxCovers: number | null }[];
  /** Live bookings that day (pending/confirmed/seated…), with their area. */
  reservations: { areaId: string | null; time: string; partySize: number }[];
  partySize?: number;
}

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Mon=0…Sun=6 for a calendar date, independent of the runtime's zone. */
export function weekdayOfDate(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function dayHoursFor(hours: WeekHours | null, date: string): DayHours | null {
  return hours ? (hours[weekdayOfDate(date)] ?? null) : null;
}

export function dayAvailability(input: DayAvailabilityInput): DayStatus {
  if (!input.enabled) return { ok: false, reason: 'not_enabled' };
  if (input.date < input.today) return { ok: false, reason: 'past' };
  if (input.date > addDays(input.today, Math.max(0, input.maxDays))) return { ok: false, reason: 'too_far' };

  const day = dayHoursFor(input.hours, input.date);
  if (day?.closed) return { ok: false, reason: 'closed' };

  // Capacity: any capped public area with any slot in the day's window that
  // still fits the party. No capped areas = nothing can fill.
  const capped = input.areas.filter((a) => a.maxCovers != null);
  if (capped.length === 0) return { ok: true };

  const party = Math.max(1, input.partySize ?? 1);
  const slot = Math.max(5, input.slotMinutes || 30);
  let open = day ? toMin(day.open) : 0;
  let close = day ? toMin(day.close) : 24 * 60;
  if (close <= open) close += 24 * 60; // crosses midnight
  if (!day) {
    open = 0;
    close = 24 * 60;
  }

  for (const area of capped) {
    const taken = input.reservations.filter((r) => r.areaId === area.id);
    for (let t = open; t < close; t += slot) {
      const tt = t % (24 * 60);
      const covers = taken.reduce((n, r) => (Math.abs(toMin(r.time) - tt) < slot ? n + r.partySize : n), 0);
      if (covers + party <= (area.maxCovers as number)) return { ok: true };
    }
  }
  return { ok: false, reason: 'full' };
}

/** What the bot says when a day cannot be booked; the question gets asked again after it. */
export function dayUnavailableMessage(reason: DayUnavailableReason, phone?: string | null): string {
  switch (reason) {
    case 'not_enabled':
      return `Por ahora no estamos tomando reservaciones por este medio.${phone ? ` Puedes llamarnos al ${phone}.` : ''}`;
    case 'past': return 'Esa fecha ya pasó 😅 ¿Qué otro día te gustaría?';
    case 'too_far': return 'Esa fecha está demasiado lejos para reservar todavía. ¿Te sirve un día más cercano?';
    case 'closed': return 'Ese día estamos cerrados. ¿Te gustaría otro día?';
    case 'full': return 'Ese día ya no tenemos lugar disponible 😔 ¿Probamos con otra fecha?';
  }
}
