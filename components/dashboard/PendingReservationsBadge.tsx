'use client';

import { useEffect, useState } from 'react';
import { createClient, channelName } from '@/lib/supabase/client';
import { getPendingSummary } from '@/app/(dashboard)/reservations/actions';

/**
 * How many reservation requests are still waiting on someone.
 *
 * Lives in the sidebar because the board is scoped to a single day: a request
 * for next Saturday was invisible until you happened to navigate to next
 * Saturday. It follows the same realtime channel as the board, so a booking
 * that lands while the dashboard is open lights this up without a reload.
 */
export function PendingReservationsBadge({
  tenantId,
  initial,
}: {
  tenantId: string;
  initial: number;
}) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const refresh = () => {
      void getPendingSummary()
        .then((s) => {
          if (!cancelled) setCount(s.total);
        })
        .catch(() => {});
    };

    // Any change can move the number: a new request, a confirmation, a
    // cancellation, or an edit that moves a booking into the past.
    const channel = supabase
      .channel(channelName(`reservations-badge-${tenantId}`))
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

  if (count === 0) return null;

  return (
    <span
      aria-label={`${count} por confirmar`}
      className="ml-auto min-w-5 rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
