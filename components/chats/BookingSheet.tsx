'use client';

import { useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarDays, Check, Clock, Loader2, MapPin, MessageCircle, Pencil, Phone, StickyNote, Users, X } from 'lucide-react';
import type { Reservation, ReservationArea, ReservationStatus } from '@/lib/database.types';
import { ReservationForm } from '@/components/dashboard/ReservationForm';
import { setReservationStatus } from '@/app/(dashboard)/reservations/actions';
import { Sheet, DANGER, GHOST, PRIMARY } from '@/components/host/ui';
import { PendingPanel } from './PendingPanel';

const STATUS_TONE: Partial<Record<ReservationStatus, string>> = {
  pending: 'bg-amber-400/15 text-amber-300',
  confirmed: 'bg-emerald-400/15 text-emerald-300',
  cancelled: 'bg-red-400/15 text-red-300',
  no_show: 'bg-red-400/15 text-red-300',
};

/**
 * One booking, from the chats app: what was asked for, whatever its chat is
 * still owed, and the decision. A booking waiting for an answer is accepted
 * or rejected here; one already accepted can still be cancelled. The chat it
 * came through is one tap away.
 */
export function BookingSheet({
  booking,
  areaName,
  areas,
  onClose,
  onChat,
  onChanged,
}: {
  booking: Reservation;
  areaName?: string | null;
  /** With the areas, the booking can be changed from here (name, date, time, people, area, note). */
  areas?: ReservationArea[];
  onClose: () => void;
  /** Open the chat this booking came through; absent when it has none. */
  onChat?: () => void;
  /** The status changed: the screen underneath may want to refresh. */
  onChanged?: (status: ReservationStatus) => void;
}) {
  const t = useTranslations('bookings');
  const tp = useTranslations('pendings');
  const tr = useTranslations('reservations');
  const locale = useLocale();
  const [status, setStatus] = useState<ReservationStatus>(booking.status);
  const [cancelAsked, setCancelAsked] = useState(Boolean(booking.cancel_requested_at));
  const [notice, setNotice] = useState<{ href?: string; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [tick, setTick] = useState(0);
  const [editing, setEditing] = useState(false);

  const [y, m, d] = booking.date.split('-').map(Number);
  const when = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  function decide(next: 'confirmed' | 'cancelled') {
    if (next === 'cancelled' && status === 'confirmed' && !window.confirm(t('cancelConfirm', { name: booking.customer_name }))) return;
    const before = status;
    setStatus(next);
    setCancelAsked(false);
    setNotice(null);
    start(async () => {
      try {
        const r = await setReservationStatus(booking.id, next);
        if (r.sent) setNotice({ text: tp('told') });
        else if (r.href) setNotice({ href: r.href, text: tp('tell') });
        setTick((n) => n + 1);
        onChanged?.(next);
      } catch {
        setStatus(before);
      }
    });
  }

  const open = status === 'pending';
  const live = status === 'confirmed';
  // Anything still ahead can be changed: a date, an hour, two more people.
  const editable = Boolean(areas) && (open || live);

  const footer = (
    <div className="space-y-2">
      {notice && (
        <p className="text-xs text-white/70">
          {notice.href ? (
            <a href={notice.href} target="_blank" rel="noreferrer" className="font-semibold text-emerald-300 underline">{notice.text}</a>
          ) : (
            notice.text
          )}
        </p>
      )}
      {open && (
        <div className="flex gap-2">
          <button onClick={() => decide('confirmed')} disabled={pending} className={`${PRIMARY} flex-1 !bg-emerald-500 !text-white`}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {tp('accept')}
          </button>
          <button onClick={() => decide('cancelled')} disabled={pending} className={`${DANGER} flex-1`}>
            <X className="h-4 w-4" /> {tp('reject')}
          </button>
        </div>
      )}
      {editable && (
        <button onClick={() => setEditing(true)} disabled={pending} className={`${GHOST} w-full`}>
          <Pencil className="h-4 w-4" /> {t('edit')}
        </button>
      )}
      {live && (
        <button onClick={() => decide('cancelled')} disabled={pending} className={`${GHOST} w-full text-red-300`}>
          <X className="h-4 w-4" /> {t('cancelBooking')}
        </button>
      )}
      {onChat && (
        <button onClick={onChat} className={`${GHOST} w-full`}>
          <MessageCircle className="h-4 w-4" /> {t('openChat')}
        </button>
      )}
    </div>
  );

  return (
    <Sheet
      title={booking.customer_name}
      subtitle={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status] ?? 'bg-white/10 text-white/60'}`}>{tr(`status_${status}`)}</span>
          {cancelAsked && status !== 'cancelled' && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-semibold text-white">{t('cancelRequested')}</span>}
          <span className="text-white/40">{tr(`source_${booking.source}`)}</span>
        </span>
      }
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4">
        <dl className="space-y-2 text-sm">
          <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-white/40" /> <span className="first-letter:uppercase">{when}</span></div>
          <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-white/40" /> {booking.time.slice(0, 5)}</div>
          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-white/40" /> {t('people', { n: booking.party_size })}</div>
          {areaName && <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-white/40" /> {areaName}</div>}
          {booking.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-white/40" /> {booking.phone}</div>}
          {booking.note && <div className="flex items-start gap-2"><StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-white/40" /> <span className="text-white/80">{booking.note}</span></div>}
        </dl>

        {editing && areas && (
          <ReservationForm
            initial={booking}
            areas={areas}
            defaultDate={booking.date}
            defaultTime={booking.time.slice(0, 5)}
            onClose={() => setEditing(false)}
            onCreated={() => {}}
            onSaved={(r) => {
              // A confirmed booking that moved was told to the diner by itself,
              // or is left as a link a person has to tap; a pending one is not told yet.
              if (r.href) setNotice({ href: r.href, text: tp('tell') });
              else setNotice({ text: t('edited') });
              setTick((n) => n + 1);
              onChanged?.(status);
            }}
          />
        )}

        {/* What its chat is still owed. The decision on this very booking is the buttons below. */}
        {booking.whatsapp_conversation_id && (
          <PendingPanel reservationId={booking.id} hideBookingId={booking.id} watch={tick} />
        )}
      </div>
    </Sheet>
  );
}
