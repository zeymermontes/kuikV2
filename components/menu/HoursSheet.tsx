'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { DAY_KEYS, parseWeekHours, isOpenNowIn } from '@/lib/hours';
import { weekdayInTz } from '@/lib/time';

/** The full week's opening hours, today highlighted, as a bottom sheet. */
export function HoursSheet({
  hours,
  timezone,
  onClose,
}: {
  hours: unknown;
  timezone: string | null | undefined;
  onClose: () => void;
}) {
  const t = useTranslations('hours');
  const week = parseWeekHours(hours);
  // Resolved on the client, in the restaurant's own zone (see OpenStatus).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setNow(new Date()), 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!week) return null;
  const today = now ? weekdayInTz(timezone, now) : -1;
  const open = now ? isOpenNowIn(week, timezone, now) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="animate-fade absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        className="animate-slide-up relative w-full max-w-sm overflow-hidden rounded-t-[var(--sheet-radius)] p-5 sm:rounded-[var(--sheet-radius)]"
        style={{ backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text)', fontFamily: 'var(--brand-font)' }}
      >
        <button onClick={onClose} aria-label="close" className="absolute right-3 top-3 rounded-full p-1.5" style={{ color: 'var(--brand-text-secondary)' }}>
          <X className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-bold" style={{ fontFamily: 'var(--font-category)', color: 'var(--brand-primary)' }}>
          {t('title')}
        </h2>
        {open !== null && (
          <p className="mt-1 flex items-center gap-2 text-xs font-medium">
            <span className={`h-2 w-2 rounded-full ${open ? 'bg-green-500' : 'bg-red-500'}`} />
            {open ? t('openNow') : t('closedNow')}
          </p>
        )}
        <ul className="mt-4 space-y-1.5 text-sm">
          {week.map((d, i) => {
            const isToday = i === today;
            return (
              <li
                key={DAY_KEYS[i]}
                className={`flex items-center justify-between rounded-lg px-2 py-1 ${isToday ? 'font-bold' : ''}`}
                style={isToday ? { backgroundColor: 'var(--tab-unselected-bg)', color: 'var(--tab-unselected-text)' } : undefined}
              >
                <span>{t(DAY_KEYS[i])}</span>
                <span style={!isToday ? { color: d.closed ? 'var(--brand-text-secondary)' : undefined } : undefined}>
                  {d.closed ? t('closed') : `${d.open} – ${d.close}`}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
