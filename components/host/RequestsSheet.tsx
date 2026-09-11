'use client';

import { useEffect, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Clock, MessageCircle, Phone, Users, X } from 'lucide-react';
import type { Reservation } from '@/lib/database.types';
import { listPendingReservations } from '@/app/(dashboard)/reservations/actions';
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
  noticeFor,
  onSendNotice,
}: {
  tenantId: string;
  onClose: () => void;
  onDecide: (id: string, status: 'confirmed' | 'cancelled') => void;
  /** Reservation ids whose WhatsApp note still needs a tap (no automatic channel). */
  noticeFor: Record<string, { href: string }>;
  onSendNotice: (id: string) => void;
}) {
  const t = useTranslations('host');
  const locale = useLocale();
  const [rows, setRows] = useState<Reservation[] | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    const load = () => listPendingReservations().then((r) => !cancelled && setRows(r)).catch(() => !cancelled && setRows([]));
    load();
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(`host-requests-${tenantId}`))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations', filter: `tenant_id=eq.${tenantId}` }, load)
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

  const pendingNotices = Object.keys(noticeFor);

  return (
    <Sheet title={t('requestsTitle')} subtitle={t('requestsHint')} onClose={onClose}>
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
            <li key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
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
              <div className="mt-3 flex gap-2">
                <button disabled={busy.has(r.id)} onClick={() => decide(r, 'confirmed')} className={`${PRIMARY} flex-1`}>
                  <Check className="h-4 w-4" /> {t('act_confirm')}
                </button>
                <button disabled={busy.has(r.id)} onClick={() => decide(r, 'cancelled')} className={`${DANGER} flex-1`}>
                  <X className="h-4 w-4" /> {t('act_decline')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
