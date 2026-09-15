// Business hours: a weekly schedule, Monday (0) → Sunday (6), plus special
// dates that override it — Christmas closed, Mother's Day open longer.
//
// Stored in one `hours` JSON: the bare 7-entry array (the original shape,
// still what is written while there are no special dates) or
// `{ week, special }`. Every reader goes through parseSchedule / parseWeekHours,
// so both shapes keep working everywhere.
//
// Two flavours of every "is it open" question: the plain ones read the
// runtime's clock, the `…In(tz)` ones read the restaurant's. Server code and
// anything shown to a visitor who might not be local wants the latter.

import { addDays, nowHHMMInTz, todayInTz } from '@/lib/time';

export interface DayHours {
  closed: boolean;
  open: string; // "HH:MM"
  close: string; // "HH:MM"
}

export type WeekHours = DayHours[]; // length 7

/** One date that does not follow the week: "2026-12-25", closed, or open 12:00–18:00. */
export interface SpecialDay extends DayHours {
  date: string; // "YYYY-MM-DD"
  /** "Navidad", "Día de las madres" — shown to diners and told to the bot. */
  label: string;
}

export interface Schedule {
  week: WeekHours;
  /** Sorted by date; may be empty. */
  special: SpecialDay[];
}

/** A day's hours with where they came from, for "hoy (Navidad): cerrado". */
export interface ResolvedDay extends DayHours {
  label?: string;
}

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function defaultWeekHours(): WeekHours {
  return DAY_KEYS.map(() => ({ closed: false, open: '09:00', close: '18:00' }));
}

function parseDay(d: unknown): DayHours {
  const o = (d ?? {}) as Record<string, unknown>;
  return {
    closed: Boolean(o.closed),
    open: typeof o.open === 'string' ? o.open : '09:00',
    close: typeof o.close === 'string' ? o.close : '18:00',
  };
}

function parseWeek(v: unknown): WeekHours | null {
  if (!Array.isArray(v) || v.length !== 7) return null;
  return v.map(parseDay);
}

/** Coerce stored JSON — either shape — into a schedule, or null if unset. */
export function parseSchedule(v: unknown): Schedule | null {
  const bare = parseWeek(v);
  if (bare) return { week: bare, special: [] };
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const week = parseWeek(o.week);
  if (!week) return null;
  const special = (Array.isArray(o.special) ? o.special : [])
    .map((x) => {
      const r = (x ?? {}) as Record<string, unknown>;
      if (typeof r.date !== 'string' || !ISO_DATE.test(r.date)) return null;
      return { ...parseDay(r), date: r.date, label: typeof r.label === 'string' ? r.label.trim() : '' };
    })
    .filter((x): x is SpecialDay => x !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return { week, special };
}

/** The weekly part only — what most of the app needs. */
export function parseWeekHours(v: unknown): WeekHours | null {
  return parseSchedule(v)?.week ?? null;
}

/** What to store: the plain week while nothing is special, so older readers keep working. */
export function serializeSchedule(s: Schedule): unknown {
  return s.special.length ? { week: s.week, special: s.special } : s.week;
}

/** Mon=0…Sun=6 for a calendar date, independent of the runtime's zone. */
export function weekdayOfDate(date: string): number {
  return (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
}

/** The hours on one calendar date: a special day if there is one, else its weekday. */
export function hoursOn(s: Schedule | WeekHours, date: string): ResolvedDay {
  const sched = asSchedule(s);
  const sp = sched.special.find((x) => x.date === date);
  if (sp) return { closed: sp.closed, open: sp.open, close: sp.close, label: sp.label || undefined };
  return sched.week[weekdayOfDate(date)];
}

/** Special dates from `today` on, soonest first. */
export function upcomingSpecials(s: Schedule | WeekHours, today: string, days = 90): SpecialDay[] {
  const limit = new Date(`${today}T12:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + days);
  const until = limit.toISOString().slice(0, 10);
  return asSchedule(s).special.filter((x) => x.date >= today && x.date <= until);
}

function asSchedule(s: Schedule | WeekHours): Schedule {
  return Array.isArray(s) ? { week: s, special: [] } : s;
}

/** "YYYY-MM-DD" of a Date in the runtime's own zone. */
function localIso(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
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
export function isOpenNow(hours: Schedule | WeekHours, now: Date): boolean {
  return openAt(hoursOn(hours, localIso(now)), now.getHours() * 60 + now.getMinutes());
}

export function todayHours(hours: Schedule | WeekHours, now: Date): ResolvedDay {
  return hoursOn(hours, localIso(now));
}

/** Whether the schedule is open right now in the restaurant's own timezone. */
export function isOpenNowIn(
  hours: Schedule | WeekHours,
  tz: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const [h, m] = nowHHMMInTz(tz, now).split(':').map(Number);
  return openAt(hoursOn(hours, todayInTz(tz, now)), h * 60 + m);
}

/** Today's hours according to the restaurant's own calendar day (special dates included). */
export function todayHoursIn(
  hours: Schedule | WeekHours,
  tz: string | null | undefined,
  now: Date = new Date(),
): ResolvedDay {
  return hoursOn(hours, todayInTz(tz, now));
}

/** When a closed restaurant opens again, for "cerrado hasta el miércoles". */
export interface NextOpening {
  date: string; // "YYYY-MM-DD"
  open: string; // "HH:MM"
  /** 0 = later today, 1 = tomorrow, … */
  daysAhead: number;
  label?: string;
}

/**
 * The next time the doors open, in the restaurant's own calendar, or null
 * when nothing opens within `days`. Later today counts when now is before
 * today's opening time; an ongoing after-midnight shift is "open", not next.
 */
export function nextOpeningIn(
  hours: Schedule | WeekHours,
  tz: string | null | undefined,
  now: Date = new Date(),
  days = 14,
): NextOpening | null {
  if (isOpenNowIn(hours, tz, now)) return null;
  const today = todayInTz(tz, now);
  const [h, m] = nowHHMMInTz(tz, now).split(':').map(Number);
  const minutes = h * 60 + m;
  for (let i = 0; i <= days; i++) {
    const date = addDays(today, i);
    const day = hoursOn(hours, date);
    if (day.closed) continue;
    if (i === 0 && minutes >= toMin(day.open)) continue; // already past today's opening
    return { date, open: day.open, daysAhead: i, label: day.label };
  }
  return null;
}

/** Google Maps link: an explicit URL if set, else a search by address. */
export function mapHref(mapsUrl: string | null, address: string | null): string | null {
  if (mapsUrl && mapsUrl.trim()) return mapsUrl.trim();
  if (address && address.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  }
  return null;
}
