'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarPlus, Trash2 } from 'lucide-react';
import {
  DAY_KEYS, defaultWeekHours, parseSchedule, serializeSchedule,
  type Schedule, type SpecialDay, type WeekHours,
} from '@/lib/hours';

/**
 * The week, then the dates that break it: a closed Christmas, a longer
 * Mother's Day. Past special dates are dropped on the next save — they have
 * nothing left to say.
 */
export function HoursEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (hours: unknown) => void;
}) {
  const t = useTranslations('hours');
  const [sched, setSched] = useState<Schedule>(() => parseSchedule(value) ?? { week: defaultWeekHours(), special: [] });

  function apply(next: Schedule) {
    const today = localToday();
    const pruned = { ...next, special: next.special.filter((d) => d.date >= today || !d.date) };
    setSched(pruned);
    onChange(serializeSchedule(pruned));
  }
  function patch(i: number, p: Partial<{ closed: boolean; open: string; close: string }>) {
    apply({ ...sched, week: sched.week.map((d, j) => (j === i ? { ...d, ...p } : d)) as WeekHours });
  }
  function patchSpecial(i: number, p: Partial<SpecialDay>) {
    const special = sched.special.map((d, j) => (j === i ? { ...d, ...p } : d)).sort((a, b) => a.date.localeCompare(b.date));
    apply({ ...sched, special });
  }
  function addSpecial() {
    const date = nextFreeDate(sched.special.map((d) => d.date));
    apply({ ...sched, special: [...sched.special, { date, label: '', closed: true, open: '09:00', close: '18:00' }] });
  }
  function removeSpecial(i: number) {
    apply({ ...sched, special: sched.special.filter((_, j) => j !== i) });
  }

  const time = 'rounded-lg border border-neutral-300 px-2 py-1 text-sm';

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        {sched.week.map((d, i) => (
          <div key={DAY_KEYS[i]} className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-sm text-neutral-600">{t(DAY_KEYS[i])}</span>
            <label className="flex items-center gap-1 text-xs text-neutral-500">
              <input
                type="checkbox"
                checked={!d.closed}
                onChange={(e) => patch(i, { closed: !e.target.checked })}
                className="h-4 w-4 rounded border-neutral-300"
              />
              {t('open')}
            </label>
            {d.closed ? (
              <span className="text-sm text-neutral-400">{t('closed')}</span>
            ) : (
              <div className="flex items-center gap-1.5">
                <input type="time" value={d.open} onChange={(e) => patch(i, { open: e.target.value })} className={time} />
                <span className="text-neutral-400">–</span>
                <input type="time" value={d.close} onChange={(e) => patch(i, { close: e.target.value })} className={time} />
              </div>
            )}
          </div>
        ))}
      </div>

      <div>
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-medium">{t('specialTitle')}</p>
            <p className="text-xs text-neutral-500">{t('specialHint')}</p>
          </div>
          <button
            type="button"
            onClick={addSpecial}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <CalendarPlus className="h-3.5 w-3.5" /> {t('addSpecial')}
          </button>
        </div>
        {sched.special.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {sched.special.map((d, i) => (
              <div key={`${d.date}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 p-2">
                <input
                  type="date"
                  value={d.date}
                  onChange={(e) => e.target.value && patchSpecial(i, { date: e.target.value })}
                  className={time}
                  aria-label={t('specialDate')}
                />
                <input
                  type="text"
                  value={d.label}
                  placeholder={t('specialLabel')}
                  onChange={(e) => patchSpecial(i, { label: e.target.value })}
                  className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2 py-1 text-sm"
                  aria-label={t('specialLabel')}
                />
                <label className="flex items-center gap-1 text-xs text-neutral-500">
                  <input
                    type="checkbox"
                    checked={!d.closed}
                    onChange={(e) => patchSpecial(i, { closed: !e.target.checked })}
                    className="h-4 w-4 rounded border-neutral-300"
                  />
                  {t('open')}
                </label>
                {d.closed ? (
                  <span className="text-sm text-neutral-400">{t('closed')}</span>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <input type="time" value={d.open} onChange={(e) => patchSpecial(i, { open: e.target.value })} className={time} />
                    <span className="text-neutral-400">–</span>
                    <input type="time" value={d.close} onChange={(e) => patchSpecial(i, { close: e.target.value })} className={time} />
                  </div>
                )}
                <button type="button" onClick={() => removeSpecial(i)} aria-label={t('removeSpecial')} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** "YYYY-MM-DD" in the browser's zone — the editor is used at the restaurant. */
function localToday(): string {
  const n = new Date();
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

/** Tomorrow, or the first later day not already special — so two taps don't collide. */
function nextFreeDate(taken: string[]): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (x: number) => String(x).padStart(2, '0');
  for (;;) {
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (!taken.includes(iso)) return iso;
    d.setDate(d.getDate() + 1);
  }
}
