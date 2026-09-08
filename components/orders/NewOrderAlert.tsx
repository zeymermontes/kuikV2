'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bell, X } from 'lucide-react';
import { createClient, channelName } from '@/lib/supabase/client';
import type { OrderRow } from '@/lib/database.types';
import { orderCode } from '@/lib/utils';

/**
 * "A new order came in from the menu": a chime and a toast wherever staff
 * are (the register, the kitchen, the host stand, the hub), with a way to
 * the board. Mounted by those layouts for restaurants with the board on
 * (0085). The customer-facing screen never shows it. The board itself has
 * its own, richer announcement (components/dashboard/OrdersBoard.tsx).
 */
export function NewOrderAlert({ tenantId }: { tenantId: string }) {
  const t = useTranslations('orders');
  const pathname = usePathname();
  const [toasts, setToasts] = useState<OrderRow[]>([]);
  const seen = useRef(new Map<string, string>());
  const quiet = pathname.startsWith('/pos/customer') || pathname.startsWith('/orders');

  useEffect(() => {
    if (quiet) return;
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(`orders-alert-${tenantId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` }, (payload) => {
        if (payload.eventType === 'DELETE') return;
        const row = payload.new as OrderRow;
        const prev = seen.current.get(row.id);
        seen.current.set(row.id, row.payment_status);
        // A WhatsApp order arrives complete; an online one is real only once paid.
        const arrived = prev === undefined && row.payment_status !== 'pending';
        const paidNow = prev === 'pending' && row.payment_status === 'paid';
        if (!(arrived || paidNow) || row.status !== 'new') return;
        chime();
        setToasts((cur) => [...cur.filter((o) => o.id !== row.id), row].slice(-3));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, quiet]);

  if (quiet || toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-3 top-3 z-[55] mx-auto flex max-w-md flex-col gap-2">
      {toasts.map((o) => {
        const lines = ((o.items ?? []) as { name?: string; qty?: number }[]).map((l) => `${l.qty ?? 1}× ${l.name ?? ''}`).join(', ');
        return (
          <div key={o.id} className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg">
            <Bell className="h-4 w-4 shrink-0 text-amber-300" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {t('newOrder')} #{orderCode(o.id)}
                {o.customer_name ? ` · ${o.customer_name}` : ''}
              </span>
              <span className="block truncate text-xs text-white/70">{lines}</span>
            </span>
            <Link href="/orders" className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black">
              {t('view')}
            </Link>
            <button onClick={() => setToasts((cur) => cur.filter((x) => x.id !== o.id))} className="text-white/60 hover:text-white" aria-label={t('cancel')}>
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Two rising notes, like the kitchen screen's. Audio may be blocked until the first tap; that is fine. */
function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [880, 1174].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = 0.08;
      o.connect(g).connect(ctx.destination);
      const at = ctx.currentTime + i * 0.18;
      o.start(at);
      o.stop(at + 0.15);
    });
  } catch {
    // no audio: the toast still says it
  }
}
