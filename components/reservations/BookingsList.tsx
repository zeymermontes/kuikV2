'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarDays, ChevronRight, MapPin, MessageCircle, Phone, StickyNote, Users } from 'lucide-react';
import type { Reservation, ReservationStatus } from '@/lib/database.types';
import { createClient, channelName } from '@/lib/supabase/client';
import { listBookings } from '@/app/(dashboard)/reservations/actions';
import { bookingsFor, isPast, relativeDay, type BookingsFilter } from '@/lib/reservations/bookings-list';
import { todayInTz } from '@/lib/time';

const FILTERS: BookingsFilter[] = ['upcoming', 'past', 'all'];

// What a host reads first: is it settled, is somebody here, is it off.
const STATUS_TONE: Record<ReservationStatus, string> = {
  pending: 'bg-amber-400/15 text-amber-300',
  confirmed: 'bg-emerald-400/15 text-emerald-300',
  arrived: 'bg-sky-400/15 text-sky-300',
  partial: 'bg-sky-400/15 text-sky-300',
  seated: 'bg-sky-400/15 text-sky-300',
  finished: 'bg-white/10 text-white/60',
  no_show: 'bg-red-400/15 text-red-300',
  cancelled: 'bg-red-400/15 text-red-300',
  waiting: 'bg-violet-400/15 text-violet-300',
  notified: 'bg-violet-400/15 text-violet-300',
};

/**
 * Every booking of the restaurant in one list, nearest first, with a chip to
 * choose what is coming (the default), what has passed, or all of it. The
 * same component is a view of the host stand and a tab of the chats app, so
 * the two never show a booking differently.
 *
 * A booking stays under "upcoming" until an hour after its time
 * (lib/reservations/bookings-list.ts) and moves to "past" by itself: the
 * clock here ticks every minute. The list follows every change to a booking
 * over Realtime.
 */
export function BookingsList({
  tenantId,
  timezone,
  branchId,
  areas = [],
  branches = [],
  onOpen,
  onChat,
}: {
  tenantId: string;
  /** The restaurant's zone: what "today" and "tomorrow" mean here. */
  timezone: string;
  /** A branch, null for the main location; left out, every branch is listed and each row says which. */
  branchId?: string | null;
  areas?: { id: string; name: string }[];
  branches?: { id: string; name: string }[];
  /** A row was tapped: open the booking. */
  onOpen?: (r: Reservation) => void;
  /**
   * Given, a booking that came through a chat gets a second target at its
   * right edge that opens that chat straight away.
   */
  onChat?: (r: Reservation) => void;
}) {
  const t = useTranslations('bookings');
  const tr = useTranslations('reservations');
  const locale = useLocale();
  const [rows, setRows] = useState<Reservation[] | null>(null);
  const [filter, setFilter] = useState<BookingsFilter>('upcoming');
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const load = useCallback(() => {
    listBookings(branchId === undefined ? {} : { branchId })
      .then((d) => setRows([...d.upcoming, ...d.past]))
      .catch(() => setRows((cur) => cur ?? []));
  }, [branchId]);

  // A burst of changes (a booking and its notices) is one read.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    load();
    const reload = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        load();
      }, 800);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(`bookings-${tenantId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `tenant_id=eq.${tenantId}` }, reload)
      .subscribe();
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      document.removeEventListener('visibilitychange', onVisible);
      supabase.removeChannel(channel);
    };
  }, [tenantId, load]);

  const shown = useMemo(() => bookingsFor(rows ?? [], filter, now), [rows, filter, now]);
  const counts = useMemo(() => {
    const all = rows ?? [];
    const past = all.filter((r) => isPast(r.starts_at, now)).length;
    return { upcoming: all.length - past, past, all: all.length };
  }, [rows, now]);

  const today = todayInTz(timezone, new Date(now));
  const areaName = (id: string | null) => (id ? (areas.find((a) => a.id === id)?.name ?? null) : null);
  const branchName = (id: string | null) => (id ? (branches.find((b) => b.id === id)?.name ?? null) : t('mainBranch'));
  // Only worth saying when there is more than one place and the list mixes them.
  const showBranch = branchId === undefined && branches.length > 0;

  const dayLabel = (day: string) => {
    const [y, m, d] = day.split('-').map(Number);
    // The date is a calendar day, not an instant: formatted in UTC so no zone moves it.
    const long = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const near = relativeDay(day, today);
    return near ? `${t(near)} · ${long}` : long.charAt(0).toUpperCase() + long.slice(1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2" role="radiogroup" aria-label={t('tab')}>
        {FILTERS.map((f) => {
          const active = filter === f;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                active ? 'bg-white text-black' : 'border border-white/15 text-neutral-300 hover:bg-white/10'
              }`}
            >
              {t(f)}
              {rows && <span className={`text-xs ${active ? 'text-black/50' : 'text-white/40'}`}>{counts[f]}</span>}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows === null ? (
          <p className="py-16 text-center text-sm text-white/50">{t('loading')}</p>
        ) : shown.length === 0 ? (
          <p className="py-16 text-center text-sm text-white/50">{t(filter === 'upcoming' ? 'emptyUpcoming' : filter === 'past' ? 'emptyPast' : 'emptyAll')}</p>
        ) : (
          <ul className="md:mx-auto md:max-w-3xl">
            {shown.map((r, i) => {
              const prev = shown[i - 1];
              const past = isPast(r.starts_at, now);
              // "All" runs upcoming first, then past: say where one ends.
              const crossing = filter === 'all' && past && (!prev || !isPast(prev.starts_at, now));
              const newDay = !prev || prev.date !== r.date || crossing;
              const area = areaName(r.area_id);
              const canOpen = Boolean(onOpen);
              const hasChat = Boolean(onChat) && Boolean(r.whatsapp_conversation_id);
              const off = r.status === 'cancelled' || r.status === 'no_show';
              const body = (
                <>
                  <span className={`w-14 shrink-0 pt-0.5 text-base font-bold tabular-nums ${off ? 'text-white/40 line-through' : past ? 'text-white/60' : 'text-white'}`}>
                    {r.time.slice(0, 5)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className={`truncate font-semibold ${off ? 'text-white/50' : ''}`}>{r.customer_name}</span>
                      <span className="flex shrink-0 items-center gap-1 text-sm text-white/60">
                        <Users className="h-3.5 w-3.5" /> {r.party_size}
                      </span>
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] font-medium">
                      <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE[r.status] ?? 'bg-white/10 text-white/60'}`}>{tr(`status_${r.status}`)}</span>
                      {r.cancel_requested_at && r.status !== 'cancelled' && (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 font-semibold text-white">{t('cancelRequested')}</span>
                      )}
                      <span className="rounded-full border border-white/10 px-2 py-0.5 text-white/50">{tr(`source_${r.source}`)}</span>
                      {area && (
                        <span className="flex items-center gap-1 text-white/50">
                          <MapPin className="h-3 w-3" /> {area}
                        </span>
                      )}
                      {showBranch && <span className="text-white/40">{branchName(r.branch_id)}</span>}
                      {r.tags?.map((tag) => (
                        <span key={tag} className="rounded-full bg-white/10 px-2 py-0.5 text-white/70">{tag}</span>
                      ))}
                    </span>
                    {r.phone && (
                      <span className="mt-1 flex items-center gap-1 text-xs text-white/40">
                        <Phone className="h-3 w-3" /> {r.phone}
                      </span>
                    )}
                    {r.note && (
                      <span className="mt-1 flex items-start gap-1 text-xs text-white/60">
                        <StickyNote className="mt-0.5 h-3 w-3 shrink-0" /> <span className="line-clamp-2">{r.note}</span>
                      </span>
                    )}
                  </span>
                  {canOpen && !onChat && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-white/30" />}
                </>
              );
              return (
                <li key={r.id}>
                  {crossing && (
                    <p className="border-y border-white/10 bg-white/[0.03] px-3 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-white/40">{t('pastDivider')}</p>
                  )}
                  {newDay && (
                    <p className="flex items-center gap-1.5 px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-white/50">
                      <CalendarDays className="h-3.5 w-3.5" /> {dayLabel(r.date)}
                    </p>
                  )}
                  <div className="flex items-stretch border-b border-white/5 hover:bg-white/5">
                    {canOpen ? (
                      <button
                        type="button"
                        onClick={() => onOpen?.(r)}
                        title={t(onChat ? 'openBooking' : 'openDay')}
                        className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left"
                      >
                        {body}
                      </button>
                    ) : (
                      <div className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3">{body}</div>
                    )}
                    {hasChat && (
                      <button
                        type="button"
                        onClick={() => onChat?.(r)}
                        title={t('openChat')}
                        aria-label={`${t('openChat')}: ${r.customer_name}`}
                        className="shrink-0 px-4 text-white/40 hover:text-white"
                      >
                        <MessageCircle className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
