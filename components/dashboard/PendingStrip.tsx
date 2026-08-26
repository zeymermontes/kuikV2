'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Clock, ChevronRight } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { getPendingSummary, type PendingSummary } from '@/app/(dashboard)/reservations/actions';

/**
 * Requests waiting on a yes or no, across every upcoming day.
 *
 * The board below is scoped to one day — right for working a service, wrong for
 * noticing that someone asked for next Saturday. This is the bridge: it only
 * appears when something is actually pending, and each day is one tap away.
 */
export function PendingStrip({
  tenantId,
  initial,
  currentDay,
}: {
  tenantId: string;
  initial: PendingSummary;
  /** The day already on screen, so it isn't offered as somewhere to go. */
  currentDay: string;
}) {
  const t = useTranslations('reservations');
  const locale = useLocale();
  const [summary, setSummary] = useState(initial);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const refresh = () => {
      void getPendingSummary()
        .then((s) => {
          if (!cancelled) setSummary(s);
        })
        .catch(() => {});
    };

    const channel = supabase
      .channel(`reservations-pending-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations', filter: `tenant_id=eq.${tenantId}` },
        refresh,
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  if (summary.total === 0) return null;

  const dayLabel = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    // Built as UTC and read as UTC: this is a calendar label, not an instant,
    // and letting the browser's zone touch it would shift the day by one.
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  };

  const elsewhere = summary.days.filter((d) => d.date !== currentDay);

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
        <Clock className="h-4 w-4" />
        {t('pendingTitle', { count: summary.total })}
      </p>

      {elsewhere.length === 0 ? (
        <p className="mt-0.5 text-xs text-amber-800">{t('pendingAllHere')}</p>
      ) : (
        <>
          <p className="mt-0.5 text-xs text-amber-800">{t('pendingHint')}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {elsewhere.map((d) => (
              <Link
                key={d.date}
                href={`/reservations?d=${d.date}`}
                className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:bg-amber-100"
              >
                {dayLabel(d.date)}
                <span className="rounded-full bg-amber-500 px-1.5 text-[10px] text-white">{d.count}</span>
                <ChevronRight className="h-3 w-3" />
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
