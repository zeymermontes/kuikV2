'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { parseSchedule, isOpenNowIn, todayHoursIn, nextOpeningIn, type NextOpening, type Schedule } from '@/lib/hours';

/**
 * What a closed restaurant says next to its red dot. "Cerrado hasta el
 * miércoles · 09:00" when it does not open tomorrow — the bare "Cerrado"
 * next to today's hours read as "opens tomorrow at the usual time".
 */
export function closedStatus(
  t: (key: string, values?: Record<string, string>) => string,
  locale: string,
  next: NextOpening | null,
): { title: string; detail: string | null } {
  if (!next) return { title: t('closedNow'), detail: null };
  if (next.daysAhead === 0) return { title: t('closedNow'), detail: t('opensToday', { time: next.open }) };
  if (next.daysAhead === 1) return { title: t('closedNow'), detail: t('opensTomorrow', { time: next.open }) };
  const [y, m, d] = next.date.split('-').map(Number);
  const opts: Intl.DateTimeFormatOptions = next.daysAhead < 7
    ? { weekday: 'long', timeZone: 'UTC' }
    : { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' };
  const day = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, opts);
  return { title: t('closedUntil', { day }), detail: next.open };
}

export function OpenStatus({ hours, timezone }: { hours: unknown; timezone: string | null | undefined }) {
  const t = useTranslations('hours');
  const locale = useLocale();
  const week: Schedule | null = parseSchedule(hours);
  // Computed on the client to avoid an SSR/CSR mismatch, but resolved against
  // the RESTAURANT's timezone, not the visitor's — otherwise someone browsing
  // from another country is told the kitchen is closed when it is not.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setNow(new Date()), 0);
    return () => clearTimeout(id);
  }, []);

  if (!week || !now) return null;
  const open = isOpenNowIn(week, timezone, now);
  const today = todayHoursIn(week, timezone, now);
  const closed = open ? null : closedStatus(t, locale, nextOpeningIn(week, timezone, now));

  return (
    <div
      className="mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
      style={{ backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text)' }}
    >
      <span className={`h-2 w-2 rounded-full ${open ? 'bg-green-500' : 'bg-red-500'}`} />
      {open ? t('openNow') : closed!.title}
      {open && !today.closed && (
        <span style={{ color: 'var(--brand-text-secondary)' }}>
          · {today.open}–{today.close}
        </span>
      )}
      {closed?.detail && (
        <span style={{ color: 'var(--brand-text-secondary)' }}>· {closed.detail}</span>
      )}
      {today.label && (
        <span style={{ color: 'var(--brand-text-secondary)' }}>· {today.label}</span>
      )}
    </div>
  );
}
