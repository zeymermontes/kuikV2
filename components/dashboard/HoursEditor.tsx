'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { DAY_KEYS, defaultWeekHours, parseWeekHours, type WeekHours } from '@/lib/hours';

export function HoursEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (hours: WeekHours) => void;
}) {
  const t = useTranslations('hours');
  const [hours, setHours] = useState<WeekHours>(() => parseWeekHours(value) ?? defaultWeekHours());

  function apply(next: WeekHours) {
    setHours(next);
    onChange(next);
  }
  function patch(i: number, p: Partial<{ closed: boolean; open: string; close: string }>) {
    apply(hours.map((d, j) => (j === i ? { ...d, ...p } : d)));
  }

  return (
    <div className="space-y-1.5">
      {hours.map((d, i) => (
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
              <input
                type="time"
                value={d.open}
                onChange={(e) => patch(i, { open: e.target.value })}
                className="rounded-lg border border-neutral-300 px-2 py-1 text-sm"
              />
              <span className="text-neutral-400">–</span>
              <input
                type="time"
                value={d.close}
                onChange={(e) => patch(i, { close: e.target.value })}
                className="rounded-lg border border-neutral-300 px-2 py-1 text-sm"
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
