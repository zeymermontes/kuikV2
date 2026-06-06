// Weekly business hours. One entry per day, Monday (0) → Sunday (6).

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

/** Our weekday index (Mon=0…Sun=6) from a Date. */
export function weekdayIndex(now: Date): number {
  return (now.getDay() + 6) % 7;
}

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Whether the schedule is open at `now` (supports overnight ranges). */
export function isOpenNow(hours: WeekHours, now: Date): boolean {
  const day = hours[weekdayIndex(now)];
  if (!day || day.closed) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const open = toMin(day.open);
  const close = toMin(day.close);
  if (close <= open) return cur >= open || cur < close; // crosses midnight
  return cur >= open && cur < close;
}

export function todayHours(hours: WeekHours, now: Date): DayHours {
  return hours[weekdayIndex(now)];
}

/** Google Maps link: an explicit URL if set, else a search by address. */
export function mapHref(mapsUrl: string | null, address: string | null): string | null {
  if (mapsUrl && mapsUrl.trim()) return mapsUrl.trim();
  if (address && address.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address.trim())}`;
  }
  return null;
}
