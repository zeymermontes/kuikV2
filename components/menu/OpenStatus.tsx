'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { parseWeekHours, isOpenNow, todayHours } from '@/lib/hours';

export function OpenStatus({ hours }: { hours: unknown }) {
  const t = useTranslations('hours');
  const week = parseWeekHours(hours);
  // Computed on the client so it uses the visitor's local time (avoids SSR mismatch).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const id = setTimeout(() => setNow(new Date()), 0);
    return () => clearTimeout(id);
  }, []);

  if (!week || !now) return null;
  const open = isOpenNow(week, now);
  const today = todayHours(week, now);

  return (
    <div
      className="mt-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
      style={{ backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text)' }}
    >
      <span className={`h-2 w-2 rounded-full ${open ? 'bg-green-500' : 'bg-red-500'}`} />
      {open ? t('openNow') : t('closedNow')}
      {!today.closed && (
        <span style={{ color: 'var(--brand-text-secondary)' }}>
          · {today.open}–{today.close}
        </span>
      )}
    </div>
  );
}
