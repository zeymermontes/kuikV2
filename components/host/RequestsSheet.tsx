'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Clock, MessageCircle, Phone, Users, X, Headset } from 'lucide-react';
import type { Reservation } from '@/lib/database.types';
import { listPendingReservations } from '@/app/(dashboard)/reservations/actions';
import { listHandoffChats, type HandoffChat } from '@/app/host/actions';
import { createClient, channelName } from '@/lib/supabase/client';
import { Sheet, PRIMARY, DANGER } from './ui';

/**
 * The bell's panel: every request still waiting for a yes or no, whatever
 * its day — the host decides from the door, and the diner hears on
 * WhatsApp (setReservationStatus sends the note; a manual link comes back
 * when nothing automatic is possible).
 */
export function RequestsSheet({
  tenantId,
  onClose,
  onDecide,
  onKeep,
  noticeFor,
  onSendNotice,
  onOpenChat,
}: {
  tenantId: string;
  onClose: () => void;
  onDecide: (id: string, status: 'confirmed' | 'cancelled') => void;
  /** The guest asked to cancel over WhatsApp; the host keeps the booking. */
  onKeep: (id: string) => void;
  /** Reservation ids whose WhatsApp note still needs a tap (no automatic channel). */
  noticeFor: Record<string, { href: string }>;
  onSendNotice: (id: string) => void;
  /** Open the WhatsApp chat of a diner waiting for a person. */
  onOpenChat: (chat: HandoffChat) => void;
}) {
  const t = useTranslations('host');
  const locale = useLocale();
  const [rows, setRows] = useState<Reservation[] | null>(null);
  const [chats, setChats] = useState<HandoffChat[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () => listPendingReservations().then((r) => !cancelled && setRows(r)).catch(() => !cancelled && setRows([]));
    load();
    const loadChats = () => listHandoffChats().then((c) => !cancelled && setChats(c)).catch(() => !cancelled && setChats([]));
    loadChats();
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(`host-requests-${tenantId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `tenant_id=eq.${tenantId}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_conversations', filter: `tenant_id=eq.${tenantId}` }, loadChats)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `tenant_id=eq.${tenantId}` }, loadChats)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [tenantId]);

  const dayLabel = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  };

  function decide(r: Reservation, status: 'confirmed' | 'cancelled') {
    setBusy((cur) => new Set(cur).add(r.id));
    // Optimistic: the row leaves the list; Realtime confirms a moment later.
    setRows((cur) => (cur ?? []).filter((x) => x.id !== r.id));
    onDecide(r.id, status);
  }
  function keep(r: Reservation) {
    setBusy((cur) => new Set(cur).add(r.id));
    setRows((cur) => (cur ?? []).filter((x) => x.id !== r.id));
    onKeep(r.id);
  }

  const pendingNotices = Object.keys(noticeFor);
  const ago = (iso: string) => {
    const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
    return mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`;
  };

  return (
    <Sheet title={t('requestsTitle')} subtitle={t('requestsHint')} onClose={onClose}>
      {/* Diners parked waiting for a person: the bot stepped aside, nobody has answered. */}
      <div className="mb-5">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-white/40">
          <Headset className="h-3.5 w-3.5" /> {t('handoffTitle')}{chats && chats.length > 0 ? ` (${chats.length})` : ''}
        </p>
        {chats === null ? (
          <p className="py-3 text-center text-sm text-white/50">…</p>
        ) : chats.length === 0 ? (
          <p className="py-3 text-center text-sm text-white/50">{t('handoffNone')}</p>
        ) : (
          <ul className="space-y-2">
            {chats.map((c) => (
              <li key={c.conversationId} className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{c.name}</p>
                    {c.lastText && <p className="mt-0.5 truncate text-sm text-white/70">“{c.lastText}”</p>}
                    <p className="mt-0.5 text-xs text-white/50">{t('handoffSince', { x: ago(c.since) })}{c.phone ? ` · ${c.phone}` : ''}</p>
                  </div>
                  <button onClick={() => onOpenChat(c)} className={`${PRIMARY} shrink-0 !px-3 !py-2`}>
                    <MessageCircle className="h-4 w-4" /> {t('openChat')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-white/40">{t('requestsSection')}</p>
      {pendingNotices.length > 0 && (
        <div className="mb-4 space-y-2">
          {pendingNotices.map((id) => (
            <button key={id} onClick={() => onSendNotice(id)} className={`${PRIMARY} w-full !bg-green-600 !text-white`}>
              <MessageCircle className="h-4 w-4" /> {t('sendNotice')}
            </button>
          ))}
        </div>
      )}
      {rows === null ? (
        <p className="py-10 text-center text-sm text-white/50">…</p>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-white/50">{t('requestsNone')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className={`rounded-2xl border p-3 ${r.cancel_requested_at ? 'border-red-400/40 bg-red-500/10' : 'border-white/10 bg-white/5'}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {r.cancel_requested_at && <p className="text-xs font-semibold uppercase tracking-wide text-red-300">{t('cancelRequested')}</p>}
                  <p className="truncate font-semibold">{r.customer_name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/70">
                    <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {dayLabel(r.date)} · {r.time.slice(0, 5)}</span>
                    <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {r.party_size}</span>
                    {r.phone && (
                      <a href={`tel:${r.phone}`} className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {r.phone}</a>
                    )}
                  </p>
                  {r.note && <p className="mt-1 text-sm text-white/60">{r.note}</p>}
                </div>
                {r.source && <span className="shrink-0 text-[11px] text-white/40">{t(`source_${r.source}`)}</span>}
              </div>
              {r.cancel_requested_at ? (
                <div className="mt-3 flex gap-2">
                  <button disabled={busy.has(r.id)} onClick={() => decide(r, 'cancelled')} className={`${DANGER} flex-1`}>
                    <X className="h-4 w-4" /> {t('act_confirmCancel')}
                  </button>
                  <button disabled={busy.has(r.id)} onClick={() => keep(r)} className={`${PRIMARY} flex-1`}>
                    <Check className="h-4 w-4" /> {t('act_keep')}
                  </button>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button disabled={busy.has(r.id)} onClick={() => decide(r, 'confirmed')} className={`${PRIMARY} flex-1`}>
                    <Check className="h-4 w-4" /> {t('act_confirm')}
                  </button>
                  <button disabled={busy.has(r.id)} onClick={() => decide(r, 'cancelled')} className={`${DANGER} flex-1`}>
                    <X className="h-4 w-4" /> {t('act_decline')}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
