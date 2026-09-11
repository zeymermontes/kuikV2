'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { Bell, CalendarCheck, CalendarX, MessageCircle, X } from 'lucide-react';
import { createClient, channelName } from '@/lib/supabase/client';

/**
 * The staff feed, heard in the room: a new booking request, a guest who
 * confirmed or cancelled, someone waiting for a person on WhatsApp. A chime
 * and a toast on every Kuik screen that is open (dashboard, host stand,
 * register, kitchen, the hub), filtered by the reader's role. The push for
 * phones that are not looking is sent by the same call (lib/alerts.ts).
 */

interface AlertRow {
  id: string;
  kind: string;
  roles: string[];
  title_es: string;
  body_es: string;
  title_en: string;
  body_en: string;
  url: string | null;
  created_at: string;
}

const TTL_MS = 15_000;

export function StaffAlerts({ tenantId, role }: { tenantId: string; role: string }) {
  const locale = useLocale();
  const [toasts, setToasts] = useState<AlertRow[]>([]);
  const seen = useRef(new Set<string>());

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(`staff-alerts-${tenantId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'staff_alerts', filter: `tenant_id=eq.${tenantId}` }, (payload) => {
        const row = payload.new as AlertRow;
        if (seen.current.has(row.id) || !row.roles?.includes(role)) return;
        seen.current.add(row.id);
        // A row replayed on reconnect is not news.
        if (Date.now() - new Date(row.created_at).getTime() > 2 * 60_000) return;
        chime(row.kind);
        setToasts((cur) => [...cur.filter((t) => t.id !== row.id), row].slice(-3));
        setTimeout(() => setToasts((cur) => cur.filter((t) => t.id !== row.id)), TTL_MS);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, role]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed inset-x-3 top-3 z-[56] mx-auto flex max-w-md flex-col gap-2">
      {toasts.map((a) => {
        const Icon = a.kind === 'handoff' || a.kind === 'flow_notify' ? MessageCircle : a.kind === 'reservation_cancelled' ? CalendarX : a.kind === 'reservation_new' ? Bell : CalendarCheck;
        const tone = a.kind === 'handoff' ? 'border-sky-300 text-sky-300' : a.kind === 'reservation_cancelled' ? 'border-red-300 text-red-300' : 'border-amber-300 text-amber-300';
        const title = locale === 'en' ? a.title_en : a.title_es;
        const body = locale === 'en' ? a.body_en : a.body_es;
        const inner = (
          <>
            <Icon className={`h-4 w-4 shrink-0 ${tone.split(' ')[1]}`} />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{title}</span>
              <span className="block text-xs text-white/70">{body}</span>
            </span>
          </>
        );
        return (
          <div key={a.id} className={`flex items-center gap-3 rounded-2xl border bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg ${tone.split(' ')[0]}`}>
            {a.url ? <Link href={a.url} className="flex min-w-0 flex-1 items-center gap-3">{inner}</Link> : <div className="flex min-w-0 flex-1 items-center gap-3">{inner}</div>}
            <button onClick={() => setToasts((cur) => cur.filter((x) => x.id !== a.id))} className="text-white/60 hover:text-white" aria-label="close">
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/** Three notes for a booking, two falling for a cancel, a double knock for a handoff. Audio may be blocked until the first tap; that is fine. */
function chime(kind: string) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes = kind === 'reservation_cancelled' ? [880, 660] : kind === 'handoff' || kind === 'flow_notify' ? [740, 740] : [784, 988, 1175];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = 0.09;
      o.connect(g).connect(ctx.destination);
      const at = ctx.currentTime + i * 0.17;
      o.start(at);
      o.stop(at + 0.14);
    });
  } catch {
    // no audio: the toast still says it
  }
}
