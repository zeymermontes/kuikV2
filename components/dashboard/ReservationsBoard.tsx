'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft, ChevronRight, Clock, Users, Phone, Check, X, RefreshCw, Plus,
  MessageCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Reservation, ReservationArea, ReservationStatus } from '@/lib/database.types';
import { createClient } from '@/lib/supabase/client';
import { addDays } from '@/lib/time';
import { digitsOnly } from '@/lib/utils';
import {
  listDayReservations, setReservationStatus, markNotificationSent, type PendingSummary,
} from '@/app/(dashboard)/reservations/actions';
import { ReservationForm } from './ReservationForm';
import { PushToggle } from './PushToggle';
import { PendingNotifications } from './PendingNotifications';
import { PendingStrip } from './PendingStrip';

const STATUS_TONE: Record<ReservationStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  confirmed: 'bg-green-100 text-green-700',
  seated: 'bg-blue-100 text-blue-700',
  cancelled: 'bg-neutral-100 text-neutral-400 line-through',
};

const FILTERS = ['all', 'pending', 'confirmed', 'seated', 'cancelled'] as const;
type Filter = (typeof FILTERS)[number];

/** Round a "HH:MM" down to the start of its slot, so rows group into buckets. */
function slotOf(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0);
  const start = Math.floor(total / minutes) * minutes;
  return `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`;
}

export function ReservationsBoard({
  tenantId,
  day,
  today,
  initial,
  areas,
  slotMinutes,
  pendingSummary,
}: {
  tenantId: string;
  /** The day being viewed, "YYYY-MM-DD" in the restaurant's own timezone. */
  day: string;
  /** What "today" is for this restaurant — not for the server. */
  today: string;
  initial: Reservation[];
  areas: ReservationArea[];
  slotMinutes: number;
  /** Pending across ALL upcoming days — the day-scoped count is computed below. */
  pendingSummary: PendingSummary;
}) {
  const t = useTranslations('reservations');
  const [rows, setRows] = useState<Reservation[]>(initial);
  const [live, setLive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [showForm, setShowForm] = useState(false);
  // Notices Kuik has written but that still need a human to press send.
  const [toSend, setToSend] = useState<Record<string, { href: string; notificationId: string }>>({});
  const [, start] = useTransition();
  const router = useRouter();

  async function refresh() {
    setRefreshing(true);
    try {
      setRows(await listDayReservations(day));
    } catch {
      // keep what we have rather than blanking the screen mid-service
    } finally {
      setRefreshing(false);
    }
  }

  // Live updates over websockets, same shape as the orders board. RLS scopes
  // rows to this tenant; the extra filtering below is about the visible DAY,
  // which the subscription can't express.
  useEffect(() => {
    const supabase = createClient();

    const apply = (row: Reservation) =>
      setRows((cur) => {
        const without = cur.filter((r) => r.id !== row.id);
        // Edited onto another day? It belongs on that day's screen, not this one.
        if (row.date !== day) return without;
        return [...without, row].sort((a, b) => a.time.localeCompare(b.time));
      });

    const channel = supabase
      .channel(`reservations-${tenantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reservations', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const id = (payload.old as { id?: string }).id;
            if (id) setRows((cur) => cur.filter((r) => r.id !== id));
            return;
          }
          const row = payload.new as Reservation;
          apply(row);
          // A brand-new request is the thing a hostess must not miss.
          if (payload.eventType === 'INSERT' && row.status === 'pending') {
            void chime();
          }
        },
      )
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
        // Catch anything that landed between the server render and the socket.
        if (status === 'SUBSCRIBED') void refresh();
      });

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, day]);

  // A notification's Confirm/Decline goes through an API route, not this tab.
  // The worker then messages any open board so the row updates in place.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if ((e.data as { type?: string })?.type === 'kuik:reservation-updated') void refresh();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  function setStatus(row: Reservation, status: ReservationStatus) {
    setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, status } : r)));

    start(async () => {
      const result = await setReservationStatus(row.id, status);
      // Only surface a send button when a human actually has to press one. With
      // a connected WhatsApp number the message goes out by itself and there is
      // no link at all.
      //
      // Deliberately NOT pre-opening a tab inside the click: that is the only
      // way to beat the popup blocker, but the click cannot know yet whether
      // there will be a link — so it left a blank tab behind every time the
      // notice was automatic, or the diner had no phone.
      if (result.href && result.notificationId) {
        setToSend((cur) => ({
          ...cur,
          [row.id]: { href: result.href!, notificationId: result.notificationId! },
        }));
      }
    });
  }

  /** Open the prefilled chat. Runs inside the click, so no popup is blocked. */
  function sendNotice(reservationId: string) {
    const item = toSend[reservationId];
    if (!item) return;
    window.open(item.href, '_blank');
    setToSend((cur) => {
      const next = { ...cur };
      delete next[reservationId];
      return next;
    });
    start(async () => markNotificationSent(item.notificationId));
  }

  const visible = useMemo(
    () => rows.filter((r) => filter === 'all' || r.status === filter),
    [rows, filter],
  );

  const slots = useMemo(() => {
    const bySlot = new Map<string, Reservation[]>();
    for (const r of visible) {
      const key = slotOf(r.time, slotMinutes);
      bySlot.set(key, [...(bySlot.get(key) ?? []), r]);
    }
    return [...bySlot.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visible, slotMinutes]);

  const capByArea = useMemo(
    () => new Map(areas.filter((a) => a.max_covers != null).map((a) => [a.id, a.max_covers!])),
    [areas],
  );
  const areaName = useMemo(() => new Map(areas.map((a) => [a.id, a.name])), [areas]);

  const counted = rows.filter((r) => r.status !== 'cancelled');
  const covers = counted.reduce((sum, r) => sum + r.party_size, 0);
  const pending = rows.filter((r) => r.status === 'pending').length;

  const href = (d: string) => `/reservations?d=${d}`;

  return (
    <div className="max-w-3xl">
      {/* Day navigation + live indicator */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href={href(addDays(day, -1))} aria-label={t('prevDay')}
           className="rounded-lg border border-neutral-300 p-1.5 hover:bg-neutral-50">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <input
          type="date"
          value={day}
          onChange={(e) => router.push(href(e.target.value))}
          aria-label={t('pickDate')}
          className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
        />
        <Link href={href(addDays(day, 1))} aria-label={t('nextDay')}
           className="rounded-lg border border-neutral-300 p-1.5 hover:bg-neutral-50">
          <ChevronRight className="h-4 w-4" />
        </Link>
        {day !== today && (
          <Link href={href(today)} className="rounded-lg px-2 py-1.5 text-sm font-medium text-neutral-600 underline">
            {t('today')}
          </Link>
        )}

        <span className="ml-auto flex items-center gap-1.5 text-sm text-neutral-500">
          <span className={`h-2 w-2 rounded-full ${live ? 'bg-green-500' : 'bg-neutral-300'}`} />
          {live ? t('live') : t('connecting')}
        </span>
        <button onClick={refresh} aria-label={t('refresh')}
          className="rounded-lg border border-neutral-300 p-1.5 text-neutral-600 hover:bg-neutral-50">
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <PushToggle />
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
          <Plus className="h-4 w-4" /> {t('new')}
        </button>
      </div>

      {/* Summary */}
      <div className="mb-3 flex flex-wrap gap-4 rounded-xl bg-neutral-100 px-4 py-2.5 text-sm">
        <span><strong>{counted.length}</strong> {t('bookings')}</span>
        <span><strong>{covers}</strong> {t('covers')}</span>
        {pending > 0 && <span className="text-amber-700"><strong>{pending}</strong> {t('status_pending')}</span>}
      </div>

      {/* Status filter */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-sm ${
              filter === f ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
            }`}>
            {f === 'all' ? t('filter_all') : t(`status_${f}`)}
          </button>
        ))}
      </div>

      <PendingStrip tenantId={tenantId} initial={pendingSummary} currentDay={day} />

      <PendingNotifications
        day={day}
        phones={Object.fromEntries(rows.map((r) => [r.id, r.phone]))}
      />

      {slots.length === 0 ? (
        <p className="rounded-2xl border border-neutral-200 py-12 text-center text-sm text-neutral-400">
          {t('emptyDay')}
        </p>
      ) : (
        <div className="space-y-4">
          {slots.map(([slot, items]) => {
            // Flag a slot whose area is over its configured cap. Staff can
            // overbook on purpose, so this informs rather than blocks.
            const perArea = new Map<string, number>();
            for (const r of items) {
              if (r.area_id && r.status !== 'cancelled') {
                perArea.set(r.area_id, (perArea.get(r.area_id) ?? 0) + r.party_size);
              }
            }
            const over = [...perArea.entries()].some(([id, n]) => n > (capByArea.get(id) ?? Infinity));

            return (
              <div key={slot}>
                <h3 className={`mb-1.5 flex items-center gap-2 text-sm font-semibold ${over ? 'text-amber-700' : 'text-neutral-500'}`}>
                  <Clock className="h-4 w-4" /> {slot}
                  {over && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs">{t('overbookWarn')}</span>}
                </h3>
                <div className="space-y-2">
                  {items.map((r) => (
                    <div key={r.id} className="rounded-xl border border-neutral-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-semibold">{r.customer_name}</h4>
                          <div className="mt-1 flex flex-wrap gap-3 text-sm text-neutral-500">
                            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {r.time}</span>
                            <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {r.party_size}</span>
                            {r.area_id && areaName.has(r.area_id) && <span>{areaName.get(r.area_id)}</span>}
                            {r.phone && (
                              <a href={`tel:${r.phone}`} className="flex items-center gap-1 text-neutral-600">
                                <Phone className="h-3.5 w-3.5" /> {r.phone}
                              </a>
                            )}
                            {r.phone && (
                              <a href={`https://wa.me/${digitsOnly(r.phone)}`} target="_blank" rel="noreferrer"
                                 aria-label="WhatsApp" className="flex items-center gap-1 text-green-700">
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </div>
                          {r.note && <p className="mt-1 text-sm text-neutral-500">{r.note}</p>}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[r.status]}`}>
                            {t(`status_${r.status}`)}
                          </span>
                          {/* Rows written before the `source` column existed
                              have none; don't turn that into a missing-key crash. */}
                          {r.source && (
                            <span className="text-[11px] text-neutral-400">{t(`source_${r.source}`)}</span>
                          )}
                        </div>
                      </div>

                      {r.status !== 'cancelled' && (
                        <div className="flex gap-2 pt-2">
                          {r.status === 'pending' && (
                            <button onClick={() => setStatus(r, 'confirmed')}
                              className="flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
                              <Check className="h-4 w-4" /> {t('confirm')}
                            </button>
                          )}
                          {r.status === 'confirmed' && (
                            <button onClick={() => setStatus(r, 'seated')}
                              className="flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white">
                              <Users className="h-4 w-4" /> {t('seat')}
                            </button>
                          )}
                          <button onClick={() => setStatus(r, 'cancelled')}
                            className="flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium text-neutral-600">
                            <X className="h-4 w-4" /> {t('cancel')}
                          </button>
                        </div>
                      )}

                      {toSend[r.id] && (
                        <button
                          onClick={() => sendNotice(r.id)}
                          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white"
                        >
                          <MessageCircle className="h-4 w-4" /> {t('notifyCustomer')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <ReservationForm
          areas={areas}
          defaultDate={day}
          defaultTime={nextSlot(slotMinutes)}
          onClose={() => setShowForm(false)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}

/** The next slot boundary from now, so the form opens on a sensible time. */
function nextSlot(minutes: number): string {
  const now = new Date();
  const total = Math.ceil((now.getHours() * 60 + now.getMinutes()) / minutes) * minutes;
  const capped = Math.min(total, 23 * 60 + 30);
  return `${String(Math.floor(capped / 60)).padStart(2, '0')}:${String(capped % 60).padStart(2, '0')}`;
}

/**
 * A short tone for a new request. Built with WebAudio rather than an asset so
 * it costs nothing to ship; wrapped because browsers reject audio until the
 * page has been interacted with, and a rejected chime must not throw.
 */
async function chime(): Promise<void> {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => void ctx.close();
  } catch {
    // Autoplay policy, no audio device — never worth breaking the board over.
  }
}
