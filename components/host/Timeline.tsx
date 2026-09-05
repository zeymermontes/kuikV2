'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { FloorTable, Reservation } from '@/lib/database.types';
import { PARTY_STATUS_COLOR, TABLE_STATUS_COLOR, fromMinutes, isLate, sectionOf, timelineSpan, toMinutes } from '@/lib/host/model';
import type { HostSettings } from './PartyList';

// OpenTable's Timeline: one row per table, the shift across the top, each
// party a bar as long as its turn time, and a green line at "now". Gaps and
// double-bookings are visible at a glance, which the plan cannot show.

const PX_PER_MIN = 3;
const ROW = 44;
const LABEL_W = 72;
/** Room for the first hour label, which is centred on the axis start. */
const PAD = 28;

export function Timeline({
  tables,
  parties,
  now,
  isToday,
  settings,
  onSelect,
}: {
  tables: FloorTable[];
  parties: Reservation[];
  now: number;
  isToday: boolean;
  settings: HostSettings;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('host');
  const scroller = useRef<HTMLDivElement>(null);

  const live = parties.filter((r) => sectionOf(r) !== 'removed' && sectionOf(r) !== 'waitlist');
  const spans = new Map(live.map((r) => [r.id, timelineSpan(r, settings.turns, now)] as const));
  const shiftStart = Math.min(...settings.shifts.map((s) => toMinutes(s.start)), ...[...spans.values()].map((s) => s.start), 12 * 60);
  const shiftEnd = Math.max(...settings.shifts.map((s) => toMinutes(s.end)), ...[...spans.values()].map((s) => s.end), 23 * 60);
  const start = Math.floor(shiftStart / 60) * 60;
  const end = Math.ceil(shiftEnd / 60) * 60;
  const width = (end - start) * PX_PER_MIN + PAD * 2;
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const x = (min: number) => PAD + (min - start) * PX_PER_MIN;

  // Open scrolled to now, minus a little context.
  useEffect(() => {
    if (scroller.current && isToday) scroller.current.scrollLeft = Math.max(0, x(nowMin) - 200);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday]);

  const unassigned = live.filter((r) => r.table_ids.length === 0);
  const rows: { key: string; label: string; items: Reservation[] }[] = [
    ...(unassigned.length ? [{ key: '__none', label: t('noTable'), items: unassigned }] : []),
    ...tables.map((tb) => ({ key: tb.id, label: tb.label, items: live.filter((r) => r.table_ids.includes(tb.id)) })),
  ];
  const hours: number[] = [];
  for (let m = start; m <= end; m += 60) hours.push(m);

  return (
    <div ref={scroller} className="h-full overflow-auto">
      <div className="relative" style={{ width: LABEL_W + width, minHeight: '100%' }}>
        {/* Hour ruler */}
        <div className="sticky top-0 z-20 flex h-8 bg-pos-dark">
          <div className="sticky left-0 z-30 w-[72px] shrink-0 bg-pos-dark" />
          <div className="relative flex-1">
            {hours.map((m) => (
              <span key={m} className="absolute top-2 -translate-x-1/2 text-[11px] text-white/50" style={{ left: x(m) }}>
                {fromMinutes(m)}
              </span>
            ))}
          </div>
        </div>

        {/* Rows */}
        {rows.map((row) => (
          <div key={row.key} className="relative flex border-t border-white/5" style={{ height: ROW }}>
            <div className="sticky left-0 z-10 flex w-[72px] shrink-0 items-center bg-pos-dark px-3 text-sm font-bold">{row.label}</div>
            <div className="relative flex-1">
              {hours.map((m) => (
                <span key={m} className="absolute inset-y-0 border-l border-white/5" style={{ left: x(m) }} />
              ))}
              {row.items.map((r) => {
                const sp = spans.get(r.id)!;
                const late = isLate(r, now, settings.late);
                const color = r.status === 'seated' ? TABLE_STATUS_COLOR[r.table_status] : late ? '#facc15' : PARTY_STATUS_COLOR[r.status];
                return (
                  <button
                    key={r.id}
                    onClick={() => onSelect(r.id)}
                    className="absolute top-1.5 flex h-8 items-center gap-1.5 overflow-hidden rounded-lg px-2 text-left text-xs font-semibold text-white shadow"
                    style={{ left: x(sp.start), width: Math.max(40, (sp.end - sp.start) * PX_PER_MIN), backgroundColor: color, color: late && r.status !== 'seated' ? '#1f1f2a' : '#fff' }}
                    title={`${r.customer_name} · ${r.party_size} · ${r.time}`}
                  >
                    <span className="rounded bg-black/25 px-1">{r.party_size}</span>
                    <span className="truncate">{r.customer_name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="p-6 text-sm text-white/40">{t('empty_reservations')}</p>}

        {/* Now */}
        {isToday && nowMin >= start && nowMin <= end && (
          <div className="pointer-events-none absolute bottom-0 top-8 z-10 w-0.5 bg-green-400" style={{ left: LABEL_W + x(nowMin) }}>
            <span className="absolute -top-1 -translate-x-1/2 rounded bg-green-400 px-1 text-[9px] font-bold text-black">{fromMinutes(nowMin)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
