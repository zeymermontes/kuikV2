'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, Check, Printer, Volume2, VolumeX, Sun, Moon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { nowISO, nowMs } from '@/lib/pos/sync';
import { printKitchenTicket } from '@/lib/pos/print';
import type { KitchenTicket, TicketStatus } from '@/lib/pos/types';

const COLUMNS: { status: TicketStatus; next: TicketStatus; key: string; tone: string }[] = [
  { status: 'new', next: 'preparing', key: 'col_new', tone: 'border-blue-200 bg-blue-50' },
  { status: 'preparing', next: 'ready', key: 'col_preparing', tone: 'border-amber-200 bg-amber-50' },
  { status: 'ready', next: 'served', key: 'col_ready', tone: 'border-green-200 bg-green-50' },
];

type TicketLine = { name: string; qty: number; selections?: { name: string }[]; note?: string };

function beep() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    o.frequency.value = 880;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.15);
  } catch {
    // audio blocked until interaction — fine
  }
}

export function KdsBoard({ tenantId, station, locale }: { tenantId: string; station: string | null; locale: string }) {
  const t = useTranslations('pos');
  const supabase = useMemo(() => createClient(), []);
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [now, setNow] = useState(0);
  const [muted, setMuted] = useState(false);
  const [light, setLight] = useState(false);
  // Station filter chosen on-screen (only when the URL didn't pin one).
  const [pick, setPick] = useState<string | null>(null);
  const mutedRef = useRef(false);

  // Restore preferences (deferred so it doesn't setState during the effect tick).
  useEffect(() => {
    const id = setTimeout(() => {
      setMuted(localStorage.getItem('kds_muted') === '1');
      setLight(localStorage.getItem('kds_light') === '1');
    }, 0);
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  function toggleMute() {
    setMuted((m) => {
      localStorage.setItem('kds_muted', m ? '0' : '1');
      return !m;
    });
  }
  function toggleTheme() {
    setLight((l) => {
      localStorage.setItem('kds_light', l ? '0' : '1');
      return !l;
    });
  }

  // Ticking clock for the timers.
  useEffect(() => {
    const to = setTimeout(() => setNow(nowMs()), 0);
    const id = setInterval(() => setNow(nowMs()), 20_000);
    return () => {
      clearTimeout(to);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const match = (tk: KitchenTicket) => !station || tk.station === station;
    const sortFired = (a: KitchenTicket, b: KitchenTicket) => a.fired_at.localeCompare(b.fired_at);

    supabase
      .from('kitchen_tickets')
      .select('*')
      .eq('tenant_id', tenantId)
      .neq('status', 'served')
      .order('fired_at', { ascending: true })
      .then(({ data }) => setTickets(((data ?? []) as KitchenTicket[]).filter(match)));

    const channel = supabase
      .channel(`kds-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'kitchen_tickets', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string }).id;
            if (id) setTickets((cur) => cur.filter((tk) => tk.id !== id));
            return;
          }
          const tk = payload.new as KitchenTicket;
          if (!match(tk)) return;
          setTickets((cur) => {
            if (tk.status === 'served') return cur.filter((x) => x.id !== tk.id);
            const i = cur.findIndex((x) => x.id === tk.id);
            if (i === -1) {
              if (!mutedRef.current) beep();
              return [...cur, tk].sort(sortFired);
            }
            const next = [...cur];
            next[i] = tk;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, tenantId, station]);

  async function advance(tk: KitchenTicket, next: TicketStatus) {
    setTickets((cur) =>
      next === 'served' ? cur.filter((x) => x.id !== tk.id) : cur.map((x) => (x.id === tk.id ? { ...x, status: next } : x)),
    );
    await supabase.from('kitchen_tickets').update({ status: next, updated_at: nowISO() }).eq('id', tk.id);
  }

  const mins = (iso: string) => (now ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0);
  const tone = (iso: string) => (mins(iso) >= 10 ? 'text-red-600' : mins(iso) >= 5 ? 'text-amber-600' : 'text-neutral-500');

  // Stations present (for the on-screen filter, only when not pinned via URL).
  const stations = useMemo(() => {
    const s = new Set<string>();
    for (const tk of tickets) if (tk.station) s.add(tk.station);
    return [...s].sort();
  }, [tickets]);

  const shown = pick ? tickets.filter((tk) => tk.station === pick) : tickets;

  // All-day count: total quantity per item still to make (new + preparing).
  const allDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const tk of shown) {
      if (tk.status === 'ready') continue;
      for (const it of (tk.items as TicketLine[]) ?? []) m.set(it.name, (m.get(it.name) ?? 0) + it.qty);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [shown]);

  const bg = light ? 'bg-neutral-100 text-neutral-900' : 'bg-neutral-900 text-neutral-100';
  const col = light ? 'bg-white shadow-sm' : 'bg-neutral-800';
  const badge = light ? 'bg-neutral-200 text-neutral-700' : 'bg-neutral-700';
  const ctrl = light ? 'border-neutral-300 text-neutral-600' : 'border-neutral-700 text-neutral-300';

  return (
    <div className={`min-h-dvh p-4 ${bg}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-bold">
          {t('kitchen')} {station ? `· ${station}` : pick ? `· ${pick}` : ''}
        </h1>
        <div className="flex items-center gap-2">
          {!station && stations.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setPick(null)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ${pick === null ? 'bg-blue-600 text-white' : `border ${ctrl}`}`}
              >
                {t('allStations')}
              </button>
              {stations.map((s) => (
                <button
                  key={s}
                  onClick={() => setPick(s)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${pick === s ? 'bg-blue-600 text-white' : `border ${ctrl}`}`}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <button onClick={toggleMute} title={muted ? t('unmute') : t('mute')} className={`rounded-lg border p-1.5 ${ctrl}`}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button onClick={toggleTheme} title={t('theme')} className={`rounded-lg border p-1.5 ${ctrl}`}>
            {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {allDay.length > 0 && (
        <div className={`mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-sm ${col}`}>
          <span className="text-xs font-semibold uppercase tracking-wide opacity-60">{t('allDay')}</span>
          {allDay.map(([name, qty]) => (
            <span key={name}>
              <b>{qty}×</b> {name}
            </span>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((c) => {
          const items = shown.filter((tk) => tk.status === c.status);
          return (
            <div key={c.status} className={`rounded-2xl p-3 ${col}`}>
              <h2 className="mb-3 flex items-center justify-between font-semibold">
                {t(c.key)}
                <span className={`rounded-full px-2 py-0.5 text-xs ${badge}`}>{items.length}</span>
              </h2>
              <div className="space-y-3">
                {items.map((tk) => {
                  const its = (tk.items as TicketLine[]) ?? [];
                  return (
                    <div key={tk.id} className={`rounded-xl border bg-white p-3 text-neutral-900 ${c.tone}`}>
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-semibold">{tk.table_label || t('counter')}</span>
                        <span className={`flex items-center gap-1 ${tone(tk.fired_at)}`}>
                          <Clock className="h-3 w-3" /> {mins(tk.fired_at)}m
                        </span>
                      </div>
                      <ul className="space-y-1 text-sm">
                        {its.map((i, k) => (
                          <li key={k}>
                            <span className="font-semibold">{i.qty}× {i.name}</span>
                            {i.selections && i.selections.length > 0 && (
                              <span className="text-neutral-400"> · {i.selections.map((s) => s.name).join(', ')}</span>
                            )}
                            {i.note && <span className="block text-xs text-neutral-400">📝 {i.note}</span>}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => advance(tk, c.next)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white"
                        >
                          <Check className="h-4 w-4" /> {c.status === 'ready' ? t('deliver') : t('advance')}
                        </button>
                        <button
                          onClick={() => printKitchenTicket(tk, locale)}
                          className="rounded-lg border border-neutral-300 px-2 text-neutral-500"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {items.length === 0 && <p className="py-6 text-center text-sm text-neutral-500">—</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
