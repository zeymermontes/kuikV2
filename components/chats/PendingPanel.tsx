'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, Check, ChevronDown, ChevronUp, ClipboardList, Loader2, MessageCircleQuestion, Plus } from 'lucide-react';
import { addPending, listPendings, resolvePending, type ChatPending } from '@/app/chats/actions';
import { keepReservation, setReservationStatus } from '@/app/(dashboard)/reservations/actions';

/**
 * What a chat still owes its diner, where the person who can settle it will
 * see it: on the chat, and on the booking that chat is about.
 *
 * Two kinds. A question the bot could not answer and left for a person
 * (migration 0102): read it, answer in the chat, mark it done. And a booking
 * made through the chat that waits for a yes or a no, which is settled by
 * accepting or rejecting it right here; that one is the booking's own
 * status, so it leaves the list by itself.
 *
 * Shows nothing while there is nothing: an empty box on every chat would
 * teach people to stop reading it.
 */
export function PendingPanel({
  conversationId,
  reservationId,
  only,
  hideBookingId,
  watch,
  canAdd = false,
  onChanged,
  className = '',
}: {
  /** The chat… */
  conversationId?: string | null;
  /** …or a booking, for the chat it came through. */
  reservationId?: string | null;
  /** Leave the bookings out: the screen showing this already has their buttons. */
  only?: 'question';
  /** A booking the surrounding screen is already about. */
  hideBookingId?: string;
  /** Anything that changes when the list may have: a new message, a status. */
  watch?: unknown;
  /** Offer "add a pending" (the chat does; a booking's sheet does not). */
  canAdd?: boolean;
  onChanged?: () => void;
  className?: string;
}) {
  const t = useTranslations('pendings');
  const locale = useLocale();
  const [items, setItems] = useState<ChatPending[] | null>(null);
  const [chat, setChat] = useState<string | null>(conversationId ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ href?: string; text: string } | null>(null);
  const [adding, setAdding] = useState(false);
  // Folded to its title when the chat underneath is what needs reading.
  const [folded, setFolded] = useState(false);
  const [draft, setDraft] = useState('');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const load = useCallback(() => {
    listPendings({ conversationId, reservationId })
      .then((r) => {
        if (!alive.current) return;
        setChat(r.conversationId);
        setItems(r.items);
      })
      .catch(() => alive.current && setItems((cur) => cur ?? []));
  }, [conversationId, reservationId]);

  useEffect(() => {
    load();
  }, [load, watch]);

  // Somebody else may have settled it on another screen.
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const shown = (items ?? []).filter((p) => (only ? p.kind === only : true) && !(p.kind === 'booking' && p.id === hideBookingId));

  // Off the list at once; the server follows, and a failure brings it back.
  function settle(id: string, work: () => Promise<unknown>) {
    setBusy(id);
    work()
      .then(() => {
        if (!alive.current) return;
        setItems((cur) => (cur ?? []).filter((p) => p.id !== id));
        onChanged?.();
      })
      .catch(() => alive.current && load())
      .finally(() => alive.current && setBusy(null));
  }

  function decide(p: ChatPending, status: 'confirmed' | 'cancelled') {
    settle(p.id, async () => {
      const r = await setReservationStatus(p.id, status);
      if (!alive.current) return;
      // Sent by itself over the chat, or left as a link a person has to tap.
      if (r.sent) setNotice({ text: t('told') });
      else if (r.href) setNotice({ href: r.href, text: t('tell') });
    });
  }

  function add() {
    const text = draft.trim();
    if (!text || !chat) return;
    setDraft('');
    setAdding(false);
    addPending(chat, text).then(load).then(() => onChanged?.()).catch(() => {});
  }

  const day = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  };

  if (shown.length === 0 && !notice && !(canAdd && chat)) return null;

  const empty = shown.length === 0 && !notice;

  return (
    // The outer box is what the caller places (and makes solid when it floats
    // over a chat); the inner one is the panel itself.
    <div className={className}>
    <section className={empty ? '' : 'rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm'} aria-label={t('title')}>
      {shown.length > 0 && (
        <button
          type="button"
          onClick={() => setFolded((v) => !v)}
          aria-expanded={!folded}
          className={`flex w-full items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-200 ${folded ? '' : 'mb-2'}`}
        >
          <ClipboardList className="h-3.5 w-3.5" /> {t('title')}
          <span className="rounded-full bg-amber-500 px-1.5 text-[11px] text-white">{shown.length}</span>
          {folded ? <ChevronDown className="ml-auto h-4 w-4" /> : <ChevronUp className="ml-auto h-4 w-4" />}
        </button>
      )}
      {!folded && (
      <>
      <ul className="space-y-2">
        {shown.map((p) => (
          <li key={`${p.kind}-${p.id}`} className="rounded-xl bg-black/25 p-2.5">
            {p.kind === 'question' ? (
              <div className="flex items-start gap-2">
                <MessageCircleQuestion className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                <div className="min-w-0 flex-1">
                  <p className="text-white">{p.summary}</p>
                  <p className="mt-0.5 text-[11px] text-white/40">{t(p.by === 'staff' ? 'byStaff' : 'byBot')}</p>
                </div>
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => settle(p.id, () => resolvePending(p.id))}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-neutral-900 disabled:opacity-50"
                >
                  {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {t('done')}
                </button>
              </div>
            ) : (
              p.booking && (
                <div>
                  <div className="flex items-start gap-2">
                    <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-white">{t(p.booking.cancelRequested ? 'cancelAsked' : 'bookingToAccept')}</p>
                      <p className="text-white/70">
                        {p.booking.name} · {t('people', { n: p.booking.party })} · {day(p.booking.date)} · {p.booking.time}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {p.booking.cancelRequested ? (
                      <>
                        <button type="button" disabled={busy === p.id} onClick={() => decide(p, 'cancelled')} className="flex-1 rounded-xl bg-red-600/90 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('cancelIt')}</button>
                        <button type="button" disabled={busy === p.id} onClick={() => settle(p.id, () => keepReservation(p.id))} className="flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('keepIt')}</button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={busy === p.id} onClick={() => decide(p, 'confirmed')} className="flex-1 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('accept')}</button>
                        <button type="button" disabled={busy === p.id} onClick={() => decide(p, 'cancelled')} className="flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('reject')}</button>
                      </>
                    )}
                  </div>
                </div>
              )
            )}
          </li>
        ))}
      </ul>

      {notice && (
        <p className="mt-2 text-xs text-white/70">
          {notice.href ? (
            <a href={notice.href} target="_blank" rel="noreferrer" className="font-semibold text-emerald-300 underline" onClick={() => setNotice(null)}>{notice.text}</a>
          ) : (
            notice.text
          )}
        </p>
      )}

      {canAdd && chat && (
        adding ? (
          <div className={`flex gap-2 ${shown.length > 0 || notice ? 'mt-2' : ''}`}>
            <input
              autoFocus
              value={draft}
              maxLength={200}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') add();
                if (e.key === 'Escape') setAdding(false);
              }}
              placeholder={t('addPlaceholder')}
              className="h-9 min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none"
            />
            <button type="button" onClick={add} disabled={!draft.trim()} className="rounded-lg bg-white px-3 text-xs font-semibold text-neutral-900 disabled:opacity-40">{t('add')}</button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={`flex items-center gap-1 text-xs font-semibold text-white/50 hover:text-white ${shown.length > 0 || notice ? 'mt-2' : ''}`}>
            <Plus className="h-3.5 w-3.5" /> {t('addOne')}
          </button>
        )
      )}
      </>
      )}
    </section>
    </div>
  );
}
