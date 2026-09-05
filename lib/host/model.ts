import type { Reservation, ReservationShift, ReservationStatus, TableStatus, FloorTable, FloorCombination } from '@/lib/database.types';

// The host stand's vocabulary. Colours and orderings follow OpenTable's host
// app closely on purpose: a hostess who has run a floor on it should read
// Kuik's plan without being taught. Client-safe: no server imports.

/** Course progression while seated, in the order the host taps through it. */
export const TABLE_STATUS_ORDER: TableStatus[] = ['seated', 'appetizer', 'entree', 'dessert', 'check', 'paid', 'bussing'];

/** Each table status has its own colour so the plan reads at a glance. */
export const TABLE_STATUS_COLOR: Record<TableStatus, string> = {
  seated: '#3b82f6',
  appetizer: '#22c55e',
  entree: '#14b8a6',
  dessert: '#a855f7',
  check: '#f59e0b',
  paid: '#f97316',
  bussing: '#6b7280',
};

/** Left stripe / badge colour of a party row. */
export const PARTY_STATUS_COLOR: Record<ReservationStatus, string> = {
  pending: '#f59e0b',
  confirmed: '#60a5fa',
  arrived: '#22c55e',
  partial: '#2dd4bf',
  seated: '#3b82f6',
  finished: '#9ca3af',
  no_show: '#ef4444',
  cancelled: '#6b7280',
  waiting: '#c084fc',
  notified: '#818cf8',
};

/** A table with a booking due soon but nobody seated yet. */
export const RESERVED_SOON_COLOR = '#c4b5fd';
export const FREE_TABLE_COLOR = '#3a3a48';
export const BLOCKED_TABLE_COLOR = '#1f1f2a';

export const DEFAULT_SHIFTS: ReservationShift[] = [
  { name: 'Comida', start: '12:00', end: '17:00' },
  { name: 'Cena', start: '17:00', end: '23:30' },
];

/** Minutes a party of N typically holds a table. Larger parties fall back to the biggest key. */
export const DEFAULT_TURNS: Record<string, number> = { '1': 60, '2': 75, '3': 90, '4': 90, '5': 105, '6': 120, '7': 120, '8': 150 };

export const DEFAULT_LATE_MINUTES = 15;

/** Waitlist quotes offered as one-tap chips, per party size band. */
export const QUOTE_CHOICES = [5, 10, 15, 20, 30, 45, 60];

export const PARTY_TAGS = ['vip', 'first_time', 'birthday', 'anniversary', 'allergy', 'stroller', 'wheelchair'] as const;
export type PartyTag = (typeof PARTY_TAGS)[number];

export type Section = 'waitlist' | 'reservations' | 'seated' | 'finished' | 'removed';

/** Which list a party belongs to. */
export function sectionOf(r: Pick<Reservation, 'status'>): Section {
  switch (r.status) {
    case 'waiting':
    case 'notified':
      return 'waitlist';
    case 'seated':
      return 'seated';
    case 'finished':
      return 'finished';
    case 'no_show':
    case 'cancelled':
      return 'removed';
    default:
      return 'reservations';
  }
}

export function turnMinutesFor(party: number, turns: Record<string, number> | null | undefined, override?: number | null): number {
  if (override) return override;
  const table = turns && Object.keys(turns).length > 0 ? turns : DEFAULT_TURNS;
  const keys = Object.keys(table).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const key = keys.find((k) => k >= party) ?? keys[keys.length - 1];
  return table[String(key)] ?? 90;
}

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function fromMinutes(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

/** The shift a wall-clock time falls in (the last one whose window contains it). */
export function shiftAt(hhmm: string, shifts: ReservationShift[]): ReservationShift | null {
  const m = toMinutes(hhmm);
  return shifts.find((s) => m >= toMinutes(s.start) && m < toMinutes(s.end)) ?? null;
}

/** Booked, not here, and past the grace period. */
export function isLate(r: Pick<Reservation, 'status' | 'starts_at'>, now: number, lateMinutes: number): boolean {
  return (r.status === 'confirmed' || r.status === 'pending') && now > new Date(r.starts_at).getTime() + lateMinutes * 60_000;
}

/** "4m", "1h 8m" — how long since `iso`. */
export function elapsed(iso: string | null | undefined, now: number): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function minutesSince(iso: string | null | undefined, now: number): number {
  return iso ? Math.max(0, (now - new Date(iso).getTime()) / 60_000) : 0;
}

/** Minutes of the quoted wait still left; negative once over. */
export function quoteLeft(r: Pick<Reservation, 'created_at' | 'quoted_minutes'>, now: number): number | null {
  if (r.quoted_minutes == null) return null;
  return r.quoted_minutes - minutesSince(r.created_at, now);
}

export interface TableView {
  table: FloorTable;
  /** The party seated here right now. */
  seated: Reservation | null;
  /** Bookings assigned here that are still to come (soonest first). */
  upcoming: Reservation[];
  blocked: boolean;
  color: string;
}

/** Join the plan with the day's parties. `soonMinutes` = how far ahead a booking tints the table. */
export function tableViews(tables: FloorTable[], parties: Reservation[], now: number, soonMinutes = 60): TableView[] {
  const seatedBy = new Map<string, Reservation>();
  const upcomingBy = new Map<string, Reservation[]>();
  for (const r of parties) {
    if (r.status === 'seated') for (const id of r.table_ids) seatedBy.set(id, r);
    else if (r.status === 'confirmed' || r.status === 'pending' || r.status === 'arrived' || r.status === 'partial') {
      for (const id of r.table_ids) upcomingBy.set(id, [...(upcomingBy.get(id) ?? []), r]);
    }
  }
  return tables.map((table) => {
    const seated = seatedBy.get(table.id) ?? null;
    const upcoming = (upcomingBy.get(table.id) ?? []).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
    const blocked = !!table.blocked_until && new Date(table.blocked_until).getTime() > now;
    const soon = upcoming[0] && new Date(upcoming[0].starts_at).getTime() - now < soonMinutes * 60_000;
    const color = seated ? TABLE_STATUS_COLOR[seated.table_status] : blocked ? BLOCKED_TABLE_COLOR : soon ? RESERVED_SOON_COLOR : FREE_TABLE_COLOR;
    return { table, seated, upcoming, blocked, color };
  });
}

/** Tables free right now that fit the party, best fit first. */
export function suggestTables(views: TableView[], party: number): TableView[] {
  return views
    .filter((v) => !v.seated && !v.blocked && v.upcoming.length === 0 && v.table.seats >= party)
    .sort((a, b) => a.table.seats - b.table.seats);
}

export interface Suggestion {
  /** One table, or the member tables of a combination. */
  tableIds: string[];
  seats: number;
  label: string;
}

/** Single tables that fit, then combinations whose every member is free; smallest first. */
export function suggestSeating(views: TableView[], combos: FloorCombination[], party: number): Suggestion[] {
  const free = new Map(views.filter((v) => !v.seated && !v.blocked && v.upcoming.length === 0).map((v) => [v.table.id, v]));
  const singles: Suggestion[] = [...free.values()]
    .filter((v) => v.table.seats >= party)
    .map((v) => ({ tableIds: [v.table.id], seats: v.table.seats, label: v.table.label }));
  const joined: Suggestion[] = combos
    .filter((c) => c.seats >= party && c.table_ids.every((id) => free.has(id)))
    .map((c) => ({ tableIds: c.table_ids, seats: c.seats, label: c.table_ids.map((id) => free.get(id)!.table.label).join('+') }));
  return [...singles, ...joined].sort((a, b) => a.seats - b.seats);
}

/** Where a seated / booked party sits on the timeline, in minutes from midnight. */
export function timelineSpan(r: Reservation, turns: Record<string, number> | null | undefined, now: number): { start: number; end: number } {
  const turn = turnMinutesFor(r.party_size, turns, r.turn_minutes);
  const startIso = r.status === 'seated' && r.seated_at ? r.seated_at : r.starts_at;
  const d = new Date(startIso);
  const start = d.getHours() * 60 + d.getMinutes();
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  // A seated party that is over its turn keeps growing until it leaves.
  const end = r.status === 'seated' ? Math.max(start + turn, nowMin) : start + turn;
  return { start, end };
}
