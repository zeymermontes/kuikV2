'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarCheck, ChevronRight, Clock, Users } from 'lucide-react';
import type { Reservation, ReservationArea, ReservationStatus } from '@/lib/database.types';
import { listChatBookings } from '@/app/chats/actions';
import { BookingSheet } from './BookingSheet';

const STATUS_TONE: Partial<Record<ReservationStatus, string>> = {
  pending: 'bg-amber-400/15 text-amber-300',
  confirmed: 'bg-emerald-400/15 text-emerald-300',
};

/**
 * The bookings a chat is about, on the chat: the ones made through it and
 * the ones under the same number, asked for or already accepted, until an
 * hour past their time. A person answering "¿sigue en pie mi reserva?" sees
 * the answer without leaving the conversation, and a tap opens the booking
 * to accept, change or cancel it (BookingSheet). Nothing is shown when
 * there is nothing: the box is news, not furniture.
 */
export function ChatBookings({
  conversationId,
  areas = [],
  watch,
  className = '',
}: {
  conversationId: string;
  /** The restaurant's areas, so a booking can be edited from here. */
  areas?: ReservationArea[];
  /** Anything after which the list may differ: a new message, a decision. */
  watch?: unknown;
  className?: string;
}) {
  const t = useTranslations('bookings');
  const tr = useTranslations('reservations');
  const locale = useLocale();
  const [items, setItems] = useState<Reservation[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    listChatBookings(conversationId)
      .then((rows) => alive.current && setItems(rows))
      .catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load, watch]);

  const day = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  };

  const open = openId ? items.find((r) => r.id === openId) ?? null : null;

  if (items.length === 0) return null;

  return (
    <div className={className}>
      <section className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm" aria-label={t('inChat')}>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-white/60">
          <CalendarCheck className="h-3.5 w-3.5" /> {t('inChat')}
        </p>
        <ul className="space-y-1.5">
          {items.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setOpenId(r.id)}
                className="flex w-full items-center gap-2 rounded-xl bg-black/25 px-2.5 py-2 text-left hover:bg-black/35"
                title={t('openBooking')}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-semibold first-letter:uppercase">{day(r.date)}</span>
                    <span className="flex items-center gap-1 text-white/70"><Clock className="h-3.5 w-3.5" /> {r.time.slice(0, 5)}</span>
                    <span className="flex items-center gap-1 text-white/70"><Users className="h-3.5 w-3.5" /> {r.party_size}</span>
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_TONE[r.status] ?? 'bg-white/10 text-white/60'}`}>{tr(`status_${r.status}`)}</span>
                    {r.cancel_requested_at && r.status !== 'cancelled' && <span className="rounded-full bg-amber-500 px-2 py-0.5 font-semibold text-white">{t('cancelRequested')}</span>}
                    <span className="text-white/50">{r.customer_name}</span>
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-white/30" />
              </button>
            </li>
          ))}
        </ul>
      </section>

      {open && (
        <BookingSheet
          key={`${open.id}-${open.date}-${open.time}-${open.party_size}-${open.status}`}
          booking={open}
          areas={areas}
          areaName={areas.find((a) => a.id === open.area_id)?.name ?? null}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
