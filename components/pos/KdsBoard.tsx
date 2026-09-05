'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Check, Printer, Volume2, VolumeX, Sun, Moon, Maximize2, Minimize2, RotateCcw, ChefHat, Flame, ListChecks, Timer,
} from 'lucide-react';
import { createClient, channelName } from '@/lib/supabase/client';
import { nowISO, nowMs } from '@/lib/pos/sync';
import { printKitchenTicket } from '@/lib/pos/print';
import type { KitchenTicket, TicketStatus } from '@/lib/pos/types';
import { ExplainLayer } from '@/components/ExplainLayer';

// The kitchen screen. Tickets read like the paper chits cooks already know:
// oldest on the left, big quantities, modifiers indented, notes in yellow,
// and one big bump button. Age drives the colour (green → amber → red) so a
// glance across the line says what is falling behind. Bumped tickets can be
// recalled for a few minutes; the all-day panel sums what is still to cook.

export type TicketLine = { name: string; qty: number; selections?: { name: string }[]; note?: string };

const NEXT: Record<TicketStatus, TicketStatus> = { new: 'preparing', preparing: 'ready', ready: 'served', served: 'served' };
const FILTERS: (TicketStatus | 'all')[] = ['all', 'new', 'preparing', 'ready'];
const WARN_MIN = 5;
const LATE_MIN = 10;
const RECALL_MIN = 15;

function chime(kind: 'new' | 'late') {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes = kind === 'new' ? [880, 1174] : [523, 523, 523];
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = f;
      const at = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
      o.start(at);
      o.stop(at + 0.15);
    });
  } catch {
    // audio blocked until interaction — fine
  }
}

export function KdsBoard({
  tenantId,
  station,
  locale,
  demo = false,
  explain = false,
  initial = [],
}: {
  tenantId: string;
  station: string | null;
  locale: string;
  /** Sample tickets in memory; nothing syncs. */
  demo?: boolean;
  explain?: boolean;
  initial?: KitchenTicket[];
}) {
  const t = useTranslations('kds');
  const supabase = useMemo(() => createClient(), []);
  const [tickets, setTickets] = useState<KitchenTicket[]>(initial);
  const [now, setNow] = useState(0);
  const [muted, setMuted] = useState(false);
  const [light, setLight] = useState(false);
  const [full, setFull] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [filter, setFilter] = useState<TicketStatus | 'all'>('all');
  const [showAllDay, setShowAllDay] = useState(false);
  // Lines the cook has ticked off inside a ticket (screen-local, like a pen on a chit).
  const [done, setDone] = useState<Record<string, Set<number>>>({});
  const mutedRef = useRef(false);
  const lateAlerted = useRef<Set<string>>(new Set());

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
  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

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
  function toggleFull() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  // Ticking clock for the timers (every 10 s: the colour bands are minute-based).
  useEffect(() => {
    const to = setTimeout(() => setNow(nowMs()), 0);
    const id = setInterval(() => setNow(nowMs()), 10_000);
    return () => {
      clearTimeout(to);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (demo) return;
    const match = (tk: KitchenTicket) => !station || tk.station === station;
    const sortFired = (a: KitchenTicket, b: KitchenTicket) => a.fired_at.localeCompare(b.fired_at);
    const since = new Date(Date.now() - RECALL_MIN * 60_000).toISOString();

    // Open tickets plus the last few bumped ones, so a wrong bump can be undone.
    supabase
      .from('kitchen_tickets')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(`status.neq.served,updated_at.gte.${since}`)
      .order('fired_at', { ascending: true })
      .then(({ data }) => setTickets(((data ?? []) as KitchenTicket[]).filter(match)));

    const channel = supabase
      .channel(channelName(`kds-${tenantId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitchen_tickets', filter: `tenant_id=eq.${tenantId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const id = (payload.old as { id?: string }).id;
          if (id) setTickets((cur) => cur.filter((tk) => tk.id !== id));
          return;
        }
        const tk = payload.new as KitchenTicket;
        if (!match(tk)) return;
        setTickets((cur) => {
          const i = cur.findIndex((x) => x.id === tk.id);
          if (i === -1) {
            if (tk.status !== 'served' && !mutedRef.current) chime('new');
            return [...cur, tk].sort(sortFired);
          }
          const next = [...cur];
          next[i] = tk;
          return next;
        });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, tenantId, station, demo]);

  const mins = (iso: string) => (now ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0);
  const secs = (iso: string) => (now ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000)) : 0);
  const clock = (iso: string) => {
    const s = secs(iso);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  };

  // One alert when a ticket crosses the late line, so the pass hears it once.
  useEffect(() => {
    if (!now || mutedRef.current) return;
    for (const tk of tickets) {
      if (tk.status === 'served' || tk.status === 'ready') continue;
      if (mins(tk.fired_at) >= LATE_MIN && !lateAlerted.current.has(tk.id)) {
        lateAlerted.current.add(tk.id);
        chime('late');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, tickets]);

  async function setStatus(tk: KitchenTicket, next: TicketStatus) {
    const at = nowISO();
    setTickets((cur) => cur.map((x) => (x.id === tk.id ? { ...x, status: next, updated_at: at } : x)));
    if (next === 'served') setDone((d) => ({ ...d, [tk.id]: new Set() }));
    if (!demo) await supabase.from('kitchen_tickets').update({ status: next, updated_at: at }).eq('id', tk.id);
  }

  function toggleLine(tk: KitchenTicket, k: number) {
    setDone((d) => {
      const set = new Set(d[tk.id] ?? []);
      if (set.has(k)) set.delete(k);
      else set.add(k);
      return { ...d, [tk.id]: set };
    });
  }

  // Bumped tickets drop off the recall strip after RECALL_MIN.
  const open = tickets.filter((tk) => tk.status !== 'served');
  const recall = tickets
    .filter((tk) => tk.status === 'served' && now && now - new Date(tk.updated_at).getTime() < RECALL_MIN * 60_000)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 8);

  const stations = useMemo(() => {
    const s = new Set<string>();
    for (const tk of open) if (tk.station) s.add(tk.station);
    return [...s].sort();
  }, [open]);

  const shown = open
    .filter((tk) => !pick || tk.station === pick)
    .filter((tk) => filter === 'all' || tk.status === filter);

  const allDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const tk of open) {
      if (tk.status === 'ready' || (pick && tk.station !== pick)) continue;
      for (const it of (tk.items as TicketLine[]) ?? []) m.set(it.name, (m.get(it.name) ?? 0) + it.qty);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [open, pick]);

  const counts = { all: open.length, new: 0, preparing: 0, ready: 0 } as Record<TicketStatus | 'all', number>;
  for (const tk of open) counts[tk.status] += 1;
  const cooking = open.filter((tk) => tk.status !== 'ready');
  const oldest = cooking.length ? Math.max(...cooking.map((tk) => mins(tk.fired_at))) : 0;
  const avg = cooking.length ? Math.round(cooking.reduce((n, tk) => n + mins(tk.fired_at), 0) / cooking.length) : 0;

  // Age band of a ticket: fresh, warning, late. Ready tickets are green until picked up.
  const band = (tk: KitchenTicket) => {
    if (tk.status === 'ready') return { head: 'bg-green-500 text-white', ring: 'ring-green-500/60', pulse: false };
    const m = mins(tk.fired_at);
    if (m >= LATE_MIN) return { head: 'bg-red-500 text-white', ring: 'ring-red-500', pulse: true };
    if (m >= WARN_MIN) return { head: 'bg-amber-400 text-neutral-900', ring: 'ring-amber-400/70', pulse: false };
    return { head: tk.status === 'new' ? 'bg-blue-500 text-white' : 'bg-neutral-600 text-white', ring: 'ring-transparent', pulse: false };
  };

  const bg = light ? 'bg-neutral-100 text-neutral-900' : 'bg-[#101014] text-neutral-100';
  const card = light ? 'bg-white text-neutral-900 shadow-md' : 'bg-[#1c1c22] text-neutral-100';
  const ctrl = light ? 'border-neutral-300 bg-white text-neutral-600' : 'border-white/10 bg-white/5 text-neutral-300';
  const chip = (active: boolean) => `rounded-full px-3 py-1.5 text-xs font-semibold ${active ? 'bg-white text-neutral-900' : `border ${ctrl}`}`;

  return (
    <div className={`flex h-dvh flex-col ${bg}`}>
      {/* Header */}
      <header className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <h1 className="mr-1 flex items-center gap-2 text-base font-bold">
          <ChefHat className="h-5 w-5" /> {t('title')}
          {(station || pick) && <span className="opacity-60">· {station ?? pick}</span>}
          {demo && <span className="rounded bg-white/10 px-1.5 text-[10px] uppercase tracking-wider opacity-70">demo</span>}
        </h1>

        <div className="flex items-center gap-1" data-help="kds_filters">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={chip(filter === f)}>
              {t(`filter_${f}`)} <span className="opacity-60">{counts[f]}</span>
            </button>
          ))}
        </div>

        {!station && stations.length > 1 && (
          <div className="flex items-center gap-1" data-help="kds_stations">
            <button onClick={() => setPick(null)} className={chip(pick === null)}>{t('allStations')}</button>
            {stations.map((s) => (
              <button key={s} onClick={() => setPick(s)} className={chip(pick === s)}>{s}</button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs" data-help="kds_stats">
          <span className="flex items-center gap-1 opacity-70"><Timer className="h-3.5 w-3.5" /> {t('avg')} <b>{avg}m</b></span>
          <span className={`flex items-center gap-1 ${oldest >= LATE_MIN ? 'text-red-400' : oldest >= WARN_MIN ? 'text-amber-400' : 'opacity-70'}`}>
            <Flame className="h-3.5 w-3.5" /> {t('oldest')} <b>{oldest}m</b>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowAllDay((v) => !v)} data-help="kds_allDay" className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${showAllDay ? 'bg-white text-neutral-900' : ctrl}`} title={t('allDay')}>
            <ListChecks className="h-4 w-4" /> <span className="hidden sm:inline">{t('allDay')}</span>
          </button>
          <button onClick={toggleMute} data-help="kds_mute" title={muted ? t('unmute') : t('mute')} className={`rounded-lg border p-1.5 ${ctrl}`}>
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button onClick={toggleTheme} data-help="kds_theme" title={t('theme')} className={`rounded-lg border p-1.5 ${ctrl}`}>
            {light ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          <button onClick={toggleFull} data-help="kds_fullscreen" title={t('fullscreen')} className={`rounded-lg border p-1.5 ${ctrl}`}>
            {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Tickets */}
        <main className="min-h-0 flex-1 overflow-y-auto p-3">
          {shown.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 opacity-50">
              <ChefHat className="h-10 w-10" />
              <p className="font-semibold">{t('empty')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3 lg:grid-cols-[repeat(auto-fill,minmax(270px,1fr))]">
              {shown.map((tk) => {
                const its = (tk.items as TicketLine[]) ?? [];
                const b = band(tk);
                const ticked = done[tk.id] ?? new Set<number>();
                const next = NEXT[tk.status];
                return (
                  <article key={tk.id} data-help="kds_ticket" className={`flex flex-col overflow-hidden rounded-2xl ring-2 ${card} ${b.ring} ${b.pulse ? 'animate-pulse' : ''}`}>
                    <header className={`flex items-center justify-between px-3 py-2 ${b.head}`} data-help="kds_ticketHead">
                      <div className="min-w-0">
                        <p className="truncate text-lg font-extrabold leading-tight">{tk.table_label ? `${t('table')} ${tk.table_label}` : t('counter')}</p>
                        <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                          {tk.station ?? ''}{tk.station ? ' · ' : ''}{t(`status_${tk.status}`)}
                        </p>
                      </div>
                      <span className="font-mono text-2xl font-bold tabular-nums" data-help="kds_timer">{clock(tk.fired_at)}</span>
                    </header>

                    <ul className="flex-1 divide-y divide-white/5 px-1 py-1" data-help="kds_lines">
                      {its.map((i, k) => {
                        const off = ticked.has(k);
                        return (
                          <li key={k}>
                            <button onClick={() => toggleLine(tk, k)} className={`flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-white/5 ${off ? 'opacity-40' : ''}`}>
                              <span className={`flex h-8 min-w-8 items-center justify-center rounded-lg px-1.5 text-lg font-black ${light ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'}`}>
                                {i.qty}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className={`block text-base font-bold leading-tight ${off ? 'line-through' : ''}`}>{i.name}</span>
                                {i.selections && i.selections.length > 0 && (
                                  <span className="mt-0.5 block text-sm font-medium text-sky-300">{i.selections.map((s) => `+ ${s.name}`).join('  ')}</span>
                                )}
                                {i.note && (
                                  <span className="mt-1 block rounded bg-yellow-300 px-1.5 py-0.5 text-sm font-bold text-neutral-900">{i.note}</span>
                                )}
                              </span>
                              {off && <Check className="mt-1 h-5 w-5 shrink-0 text-green-400" />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>

                    <footer className="flex gap-2 p-2">
                      <button
                        onClick={() => setStatus(tk, next)}
                        data-help="kds_bump"
                        className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-base font-extrabold ${
                          tk.status === 'ready' ? 'bg-green-500 text-white' : tk.status === 'new' ? 'bg-blue-500 text-white' : light ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'
                        }`}
                      >
                        <Check className="h-5 w-5" /> {t(`bump_${tk.status}`)}
                      </button>
                      <button onClick={() => printKitchenTicket(tk, locale)} data-help="kds_print" className={`rounded-xl border px-3 ${ctrl}`} title={t('print')}>
                        <Printer className="h-5 w-5" />
                      </button>
                    </footer>
                  </article>
                );
              })}
            </div>
          )}
        </main>

        {/* All-day panel */}
        {showAllDay && (
          <aside className={`w-64 shrink-0 overflow-y-auto border-l border-white/10 p-3 ${light ? 'bg-white' : 'bg-[#15151a]'}`} data-help="kds_allDayPanel">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-60">{t('allDay')}</p>
            {allDay.length === 0 && <p className="text-sm opacity-50">—</p>}
            <ul className="space-y-1">
              {allDay.map(([name, qty]) => (
                <li key={name} className="flex items-center gap-2 text-sm">
                  <span className={`flex h-7 min-w-7 items-center justify-center rounded-md px-1 font-black ${light ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900'}`}>{qty}</span>
                  <span className="font-semibold">{name}</span>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>

      {/* Recall strip */}
      {recall.length > 0 && (
        <footer className="flex items-center gap-2 overflow-x-auto border-t border-white/10 px-3 py-2" data-help="kds_recall">
          <span className="shrink-0 text-xs font-semibold uppercase tracking-wide opacity-60">{t('recall')}</span>
          {recall.map((tk) => (
            <button
              key={tk.id}
              onClick={() => setStatus(tk, 'ready')}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${ctrl}`}
            >
              <RotateCcw className="h-3.5 w-3.5" /> {tk.table_label ? `${t('table')} ${tk.table_label}` : t('counter')} · {((tk.items as TicketLine[]) ?? []).reduce((n, i) => n + i.qty, 0)}
            </button>
          ))}
        </footer>
      )}

      {demo && <ExplainLayer initialOn={explain} />}
    </div>
  );
}
