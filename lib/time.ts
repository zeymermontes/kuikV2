/**
 * Wall-clock time in a tenant's own timezone.
 *
 * Every "is it today / has it passed / when is 24h before" question in Kuik is
 * about the restaurant's local clock, but the server runs in UTC on Render.
 * That mismatch is not theoretical: `daysAgoISO(0).slice(0,10)` was hiding
 * tonight's reservations from the hostess from 18:00 Mexico time onward,
 * because UTC had already rolled over to tomorrow.
 *
 * Timezones are IANA names (`America/Mexico_City`), never numeric offsets:
 * Mexico dropped DST in 2022 except Baja California, and only the tz database
 * knows which tenant is which.
 */

/**
 * Used when a tenant has no timezone yet — either the column hasn't been added
 * or the row predates it. Falling back to the runtime's zone would put the
 * server (UTC on Render) back in charge, which is the bug this file exists to
 * fix, so pick the real default instead.
 */
export const DEFAULT_TIMEZONE = 'America/Mexico_City';

const PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tzRaw: string | null | undefined): Intl.DateTimeFormat {
  const tz = tzRaw || DEFAULT_TIMEZONE;
  let fmt = PARTS_FORMATTER_CACHE.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      // h23 rather than hour12:false — the latter can yield "24" for midnight.
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
    });
    PARTS_FORMATTER_CACHE.set(tz, fmt);
  }
  return fmt;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface ZonedParts {
  year: number; month: number; day: number;
  hour: number; minute: number; second: number;
  /** Mon=0 … Sun=6, matching lib/hours.ts. */
  weekday: number;
}

function zonedParts(at: Date, tz: string | null | undefined): ZonedParts {
  const parts = partsFormatter(tz).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
    weekday: Math.max(0, WEEKDAYS.indexOf(get('weekday'))),
  };
}

/** Milliseconds the zone is ahead of UTC at this instant (negative west of it). */
export function tzOffsetMs(at: Date, tz: string | null | undefined): number {
  const p = zonedParts(at, tz);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Round to the second: `at` may carry milliseconds the formatter dropped.
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" for the given instant in `tz`. Defaults to now. */
export function todayInTz(tz: string | null | undefined, now: Date = new Date()): string {
  const p = zonedParts(now, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "HH:MM" for the given instant in `tz`. */
export function nowHHMMInTz(tz: string | null | undefined, now: Date = new Date()): string {
  const p = zonedParts(now, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Mon=0 … Sun=6 in `tz` — the index lib/hours.ts uses. */
export function weekdayInTz(tz: string | null | undefined, now: Date = new Date()): number {
  return zonedParts(now, tz).weekday;
}

/** Add days to a "YYYY-MM-DD" string without touching timezones. */
export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/**
 * The instant at which a local wall-clock time occurs.
 * `zonedWallTimeToUtc('2026-08-25', '20:30', 'America/Mexico_City')`
 *
 * Two probes: the first guess uses the offset at the naive instant, the second
 * corrects it for the case where the guess landed on the other side of a DST
 * boundary. Two is enough for every real zone.
 */
export function zonedWallTimeToUtc(
  isoDate: string,
  hhmm: string,
  tz: string | null | undefined,
): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const naive = Date.UTC(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0);

  let guess = naive - tzOffsetMs(new Date(naive), tz);
  guess = naive - tzOffsetMs(new Date(guess), tz);
  return new Date(guess);
}

/** Whether a local date + time is already in the past for that tenant. */
export function isPastInTz(
  isoDate: string,
  hhmm: string,
  tz: string | null | undefined,
  now: Date = new Date(),
): boolean {
  return zonedWallTimeToUtc(isoDate, hhmm, tz).getTime() < now.getTime();
}
