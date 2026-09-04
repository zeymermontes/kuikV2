'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getHandoffCount } from '@/app/(dashboard)/whatsapp/inbox/actions';

/**
 * How many WhatsApp conversations are waiting on a person.
 *
 * Lives on the sidebar's WhatsApp item for the same reason the reservations
 * badge exists: a handoff that nobody sees is a diner talking to a wall. It
 * follows the conversations realtime stream, so taking a chat (or handing it
 * back to the bot) moves the number without a reload.
 */
export function HandoffBadge({ tenantId, initial }: { tenantId: string; initial: number }) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    const refresh = () => {
      void getHandoffCount()
        .then((s) => {
          if (!cancelled) setCount(s.total);
        })
        .catch(() => {});
    };

    const channel = supabase
      .channel(`wa-handoff-badge-${tenantId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_conversations', filter: `tenant_id=eq.${tenantId}` },
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
      aria-label={`${count} esperando humano`}
      className="ml-auto min-w-5 rounded-full bg-violet-500 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
