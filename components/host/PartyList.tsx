'use client';

import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Plus, Crosshair, Phone, StickyNote } from 'lucide-react';
import type { FloorTable, Reservation } from '@/lib/database.types';
import {
  PARTY_STATUS_COLOR, TABLE_STATUS_COLOR, elapsed, isLate, minutesSince, quoteLeft, sectionOf, turnMinutesFor,
  type Section, type PartyTag,
} from '@/lib/host/model';
import { PARTY_STATUS_ICON, TAG_ICON, TABLE_STATUS_ICON } from './ui';

// The reservation list: Waitlist, Reservations (by booked time), Seated (by
// seated time), then Finished and Removed when the full list is asked for.
// Row anatomy is OpenTable's — colour stripe, party size, time and timer,
// name with tags, and the table badge on the right — so a host reads it cold.

export interface HostSettings {
  shifts: { name: string; start: string; end: string }[];
  turns: Record<string, number>;
  late: number;
  slotMinutes: number;
}

const ORDER: Section[] = ['waitlist', 'reservations', 'seated', 'finished', 'removed'];

export function PartyList({
  reservations,
  tables,
  now,
  settings,
  quotes,
  showAll,
  collapsed,
  onToggle,
  onSelect,
  onSeat,
  onWalkIn,
}: {
  reservations: Reservation[];
  tables: FloorTable[];
  now: number;
  settings: HostSettings;
  /** Suggested quote per party size for the waitlist chips. */
  quotes: { party: number; minutes: number }[];
  /** Include Finished and Removed (the List view). */
  showAll: boolean;
  collapsed: Set<Section>;
  onToggle: (s: Section) => void;
  onSelect: (id: string) => void;
  onSeat: (id: string) => void;
  onWalkIn: (preset?: { party?: number; quote?: number }) => void;
}) {
  const t = useTranslations('host');
  const labelOf = new Map(tables.map((x) => [x.id, x.label] as const));

  const groups = new Map<Section, Reservation[]>();
  for (const r of reservations) {
    const s = sectionOf(r);
    groups.set(s, [...(groups.get(s) ?? []), r]);
  }
  const sorted = (s: Section, list: Reservation[]) =>
    s === 'seated'
      ? [...list].sort((a, b) => (a.seated_at ?? '').localeCompare(b.seated_at ?? ''))
      : s === 'waitlist'
        ? [...list].sort((a, b) => a.created_at.localeCompare(b.created_at))
        : [...list].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div className="flex flex-col">
      {ORDER.filter((s) => showAll || (s !== 'finished' && s !== 'removed')).map((s) => {
        const list = sorted(s, groups.get(s) ?? []);
        const covers = list.reduce((n, r) => n + r.party_size, 0);
        const open = !collapsed.has(s);
        return (
          <section key={s} className="border-b border-white/10">
            <header className="flex items-center gap-2 px-3 py-2">
              <button onClick={() => onToggle(s)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="truncate text-sm font-bold">{t(`section_${s}`)}</span>
                {(s === 'reservations' || s === 'seated') && (
                  <span className="text-[10px] text-white/40 underline decoration-dotted">{t(`by_${s}`)}</span>
                )}
              </button>
              <span className="flex items-center gap-2 text-xs text-white/60">
                <span title={t('parties')}>{list.length}</span>
                <span className="text-white/30">·</span>
                <span title={t('covers')}>{covers} 👤</span>
              </span>
              {s === 'waitlist' && (
                <button onClick={() => onWalkIn()} className="rounded-lg bg-white/10 p-1.5 hover:bg-white/20" title={t('addWalkIn')}>
                  <Plus className="h-4 w-4" />
                </button>
              )}
              <button onClick={() => onToggle(s)} className="rounded-lg p-1 text-white/50 hover:bg-white/10">
                {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </header>

            {s === 'waitlist' && open && (
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-3 pb-2">
                {quotes.map((q) => (
                  <button
                    key={q.party}
                    onClick={() => onWalkIn({ party: q.party, quote: q.minutes })}
                    className="flex shrink-0 flex-col items-center rounded-lg bg-white/10 px-2.5 py-1 leading-tight hover:bg-white/20"
                    title={t('quoteFor', { n: q.party })}
                  >
                    <span className="text-sm font-bold tabular-nums">{q.minutes === 0 ? t('now') : `${q.minutes}m`}</span>
                    <span className="text-[10px] text-white/50">{q.party}{q.party === quotes[quotes.length - 1].party ? '+' : ''}</span>
                  </button>
                ))}
              </div>
            )}

            {open && list.length === 0 && <p className="px-3 pb-3 text-xs text-white/30">{t(`empty_${s}`)}</p>}

            {open &&
              list.map((r) => {
                const late = isLate(r, now, settings.late);
                const status = late ? 'late' : r.status;
                const Icon = PARTY_STATUS_ICON[status];
                const color = late ? '#facc15' : PARTY_STATUS_COLOR[r.status];
                const turn = turnMinutesFor(r.party_size, settings.turns, r.turn_minutes);
                const overTurn = r.status === 'seated' && minutesSince(r.seated_at, now) > turn;
                const left = s === 'waitlist' ? quoteLeft(r, now) : null;
                const waitTone = left == null ? '' : left < 0 ? 'text-red-400' : left <= 5 ? 'text-yellow-300' : 'text-white/50';
                const tableLabels = r.table_ids.map((id) => labelOf.get(id)).filter(Boolean).join('+');
                const seatedOrNext = r.status === 'seated' || r.table_ids.length > 0;
                return (
                  <div key={r.id} className="flex items-stretch border-t border-white/5">
                    <button onClick={() => onSelect(r.id)} className="flex min-w-0 flex-1 items-stretch text-left hover:bg-white/5">
                      <span className="w-1.5 shrink-0" style={{ backgroundColor: color }} />
                      <span className="flex w-9 shrink-0 flex-col items-center justify-center gap-0.5 text-white/60">
                        <Icon className="h-4 w-4" style={{ color }} />
                      </span>
                      <span className="min-w-0 flex-1 py-2 pr-2">
                        <span className="flex items-center gap-1.5 text-xs text-white/50">
                          <span className="font-bold text-white">{r.party_size}</span>
                          {s === 'seated' ? (
                            <>
                              <span>{fmtTime(r.seated_at, r.time)}</span>
                              <span>·</span>
                              <span className={overTurn ? 'font-semibold text-red-400' : ''}>{elapsed(r.seated_at, now)}</span>
                              {overTurn && <span className="text-red-400">/ {turn}m</span>}
                            </>
                          ) : s === 'waitlist' ? (
                            <>
                              <span>{elapsed(r.created_at, now)} {t('waiting')}</span>
                              {r.quoted_minutes != null && (
                                <span className={waitTone}>· {t('quoted')} {r.quoted_minutes}m</span>
                              )}
                              {r.status === 'notified' && <span className="text-indigo-300">· {t('notifiedAgo', { x: elapsed(r.notified_at, now) })}</span>}
                            </>
                          ) : (
                            <>
                              <span>{r.time}</span>
                              {r.arrived_at && <span className="text-green-400">· {t('arrivedAt', { x: fmtTime(r.arrived_at, '') })}</span>}
                              {late && <span className="text-yellow-300">· {t('lateBy', { x: elapsed(r.starts_at, now) })}</span>}
                            </>
                          )}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-semibold">{r.customer_name}</span>
                          {r.tags.map((tag) => {
                            const T = TAG_ICON[tag as PartyTag];
                            return T ? <T key={tag} className="h-3.5 w-3.5 shrink-0 text-amber-300" /> : null;
                          })}
                          {r.note && <StickyNote className="h-3.5 w-3.5 shrink-0 text-white/40" />}
                          {r.phone && <Phone className="h-3 w-3 shrink-0 text-white/30" />}
                        </span>
                      </span>
                    </button>
                    {seatedOrNext ? (
                      <button
                        onClick={() => onSelect(r.id)}
                        className="m-1.5 flex w-11 shrink-0 flex-col items-center justify-center rounded-lg text-xs font-bold text-white"
                        style={{ backgroundColor: r.status === 'seated' ? TABLE_STATUS_COLOR[r.table_status] : '#4b4b5c' }}
                        title={tableLabels}
                      >
                        <span className="truncate px-1">{tableLabels || '—'}</span>
                        {r.status === 'seated' && <TableIcon status={r.table_status} />}
                      </button>
                    ) : s !== 'finished' && s !== 'removed' ? (
                      <button
                        onClick={() => onSeat(r.id)}
                        className="m-1.5 flex w-11 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white/70 hover:bg-white/10"
                        title={t('assignTable')}
                      >
                        <Crosshair className="h-4 w-4" />
                      </button>
                    ) : (
                      <span className="w-14 shrink-0" />
                    )}
                  </div>
                );
              })}
          </section>
        );
      })}
    </div>
  );
}

function TableIcon({ status }: { status: Reservation['table_status'] }) {
  const Icon = TABLE_STATUS_ICON[status];
  return <Icon className="h-3 w-3 opacity-80" />;
}

function fmtTime(iso: string | null, fallback: string): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
