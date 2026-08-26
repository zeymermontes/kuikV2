// Weekly business hours. One entry per day, Monday (0) → Sunday (6).
//
// Two flavours of every "is it open" question: the plain ones read the
// runtime's clock, the `…In(tz)` ones read the restaurant's. Server code and
// anything shown to a visitor who might not be local wants the latter.

import { nowHHMMInTz, weekdayInTz } from '@/lib/time';

export interface DayHours {
  closed: boolean;
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

export type WeekHours = DayHours[]; // length 7

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

export function defaultWeekHours(): WeekHours {
  return DAY_KEYS.map(() => ({ closed: false, open: '09:00', close: '18:00' }));
}

/** Coerce arbitrary stored JSON into a valid 7-day schedule, or null if unset. */
export function parseWeekHours(v: unknown): WeekHours | null {
  if (!Array.isArray(v) || v.length !== 7) return null;
  return v.map((d) => {
    const o = (d ?? {}) as Record<string, unknown>;
    return {
      closed: Boolean(o.closed),
      open: typeof o.open === 'string' ? o.open : '09:00',
      close: typeof o.close === 'string' ? o.close : '18:00',
    };
  });
}

/** Our weekday index (Mon=0…Sun=6) from a Date, in the runtime's own zone. */
export function weekdayIndex(now: Date): number {
  return (now.getDay() + 6) % 7;
}

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

function openAt(day: DayHours | undefined, minutesOfDay: number): boolean {
  if (!day || day.closed) return false;
  const open = toMin(day.open);
  const close = toMin(day.close);
  if (close <= open) return minutesOfDay >= open || minutesOfDay < close; // crosses midnight
  return minutesOfDay >= open && minutesOfDay < close;
}

/**
 * Whether the schedule is open at `now`, read in the RUNTIME's own timezone.
 *
 * Only correct where the runtime clock is the restaurant's clock — i.e. a
 * browser belonging to a local diner. On the server (Render runs in UTC) or for
 * a visitor abroad it will be wrong; use `isOpenNowIn` and pass the tenant's
 * timezone instead.
 */
export function isOpenNow(hours: WeekHours, now: Date): boolean {
  return openAt(hours[weekdayIndex(now)], now.getHours() * 60 + now.getMinutes());
}

export function todayHours(hours: WeekHours, now: Date): DayHours {
  return hours[weekdayIndex(now)];
}

/** Whether the schedule is open right now in the restaurant's own timezone. */
export function isOpenNowIn(
  hours: WeekHours,
  tz: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const [h, m] = nowHHMMInTz(tz, now).split(':').map(Number);
  return openAt(hours[weekdayInTz(tz, now)], h * 60 + m);
}

/** Today's hours according to the restaurant's own calendar day. */
export function todayHoursIn(
  hours: WeekHours,
  tz: string | null | undefined,
  now: Date = new Date(),
): DayHours {
  return hours[weekdayInTz(tz, now)];
}

/** Google Maps link: an explicit URL if set, else a search by address. */
export function mapHref(mapsUrl: string | null, address: string | null): string | null {
  if (mapsUrl && mapsUrl.trim()) return mapsUrl.trim();
  if (address && address.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  }
  return null;
}
