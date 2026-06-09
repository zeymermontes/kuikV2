'use client';

import { useEffect, useMemo, useState } from 'react';
import { Clock, Check, Printer } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { nowISO, nowMs } from '@/lib/pos/sync';
import { printKitchenTicket } from '@/lib/pos/print';
import type { KitchenTicket, TicketStatus } from '@/lib/pos/types';

const COLUMNS: { status: TicketStatus; next: TicketStatus; label: string; tone: string }[] = [
  { status: 'new', next: 'preparing', label: 'Nuevas', tone: 'border-blue-200 bg-blue-50' },
  { status: 'preparing', next: 'ready', label: 'Preparando', tone: 'border-amber-200 bg-amber-50' },
  { status: 'ready', next: 'served', label: 'Listas', tone: 'border-green-200 bg-green-50' },
];

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
  const supabase = useMemo(() => createClient(), []);
  const [tickets, setTickets] = useState<KitchenTicket[]>([]);
  const [now, setNow] = useState(0);

  // Ticking clock for the timers (set outside render to stay pure).
  useEffect(() => {
    const t = setTimeout(() => setNow(nowMs()), 0);
    const id = setInterval(() => setNow(nowMs()), 20_000);
    return () => {
      clearTimeout(t);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const match = (t: KitchenTicket) => !station || t.station === station;
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
            if (id) setTickets((cur) => cur.filter((t) => t.id !== id));
            return;
          }
          const t = payload.new as KitchenTicket;
          if (!match(t)) return;
          setTickets((cur) => {
            if (t.status === 'served') return cur.filter((x) => x.id !== t.id);
            const i = cur.findIndex((x) => x.id === t.id);
            if (i === -1) {
              beep();
              return [...cur, t].sort(sortFired);
            }
            const next = [...cur];
            next[i] = t;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, tenantId, station]);

  async function advance(t: KitchenTicket, next: TicketStatus) {
    setTickets((cur) =>
      next === 'served' ? cur.filter((x) => x.id !== t.id) : cur.map((x) => (x.id === t.id ? { ...x, status: next } : x)),
    );
    await supabase.from('kitchen_tickets').update({ status: next, updated_at: nowISO() }).eq('id', t.id);
  }

  const mins = (iso: string) => (now ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000)) : 0);
  const tone = (iso: string) => (mins(iso) >= 10 ? 'text-red-600' : mins(iso) >= 5 ? 'text-amber-600' : 'text-neutral-500');

  return (
    <div className="min-h-dvh bg-neutral-900 p-4 text-neutral-100">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold">Cocina {station ? `· ${station}` : ''}</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = tickets.filter((t) => t.status === col.status);
          return (
            <div key={col.status} className="rounded-2xl bg-neutral-800 p-3">
              <h2 className="mb-3 flex items-center justify-between font-semibold">
                {col.label}
                <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs">{items.length}</span>
              </h2>
              <div className="space-y-3">
                {items.map((t) => {
                  const its = (t.items as { name: string; qty: number; selections?: { name: string }[]; note?: string }[]) ?? [];
                  return (
                    <div key={t.id} className={`rounded-xl border bg-white p-3 text-neutral-900 ${col.tone}`}>
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-semibold">{t.table_label || 'Mostrador'}</span>
                        <span className={`flex items-center gap-1 ${tone(t.fired_at)}`}>
                          <Clock className="h-3 w-3" /> {mins(t.fired_at)}m
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
                          onClick={() => advance(t, col.next)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white"
                        >
                          <Check className="h-4 w-4" /> {col.status === 'ready' ? 'Entregar' : 'Avanzar'}
                        </button>
                        <button
                          onClick={() => printKitchenTicket(t, locale)}
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
