'use client';

import { useEffect, useState, useTransition } from 'react';
import { MessageCircle, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReservationNotification } from '@/lib/database.types';
import {
  listPendingNotifications, markNotificationSent,
} from '@/app/(dashboard)/reservations/actions';
import { buildWhatsappUrl } from '@/lib/whatsapp';

/**
 * Messages Kuik has written but cannot send on its own.
 *
 * WhatsApp will not let a business message someone unprompted without an
 * approved template, and Kuik has no connected number yet — so the reminder
 * cron queues the text and this is where a human sends it, one tap each.
 *
 * When the Cloud API work lands the notifier goes automatic and these rows
 * stop appearing, with no change here.
 */
export function PendingNotifications({
  day,
  phones,
}: {
  day: string;
  /** reservation id → phone, so the link can be built without another query. */
  phones: Record<string, string | null>;
}) {
  const t = useTranslations('reservations');
  const [rows, setRows] = useState<ReservationNotification[]>([]);
  const [, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void listPendingNotifications(day)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [day]);

  if (rows.length === 0) return null;

  function send(n: ReservationNotification) {
    const phone = phones[n.reservation_id];
    if (!phone || !n.body) return;
    // Opened straight from the click so the browser keeps the popup.
    window.open(buildWhatsappUrl(phone, n.body), '_blank');
    setRows((cur) => cur.filter((r) => r.id !== n.id));
    start(async () => markNotificationSent(n.id));
  }

  return (
    <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
      <h3 className="text-sm font-semibold text-amber-900">{t('remindersTitle')}</h3>
      <p className="mb-2 text-xs text-amber-800">{t('remindersHint')}</p>
      <div className="space-y-1.5">
        {rows.map((n) => (
          <div key={n.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate text-sm">{n.body}</span>
            <button
              onClick={() => send(n)}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1 text-xs font-medium text-white"
            >
              <MessageCircle className="h-3.5 w-3.5" /> {t('waSend')}
            </button>
            <button
              onClick={() => {
                setRows((cur) => cur.filter((r) => r.id !== n.id));
                start(async () => markNotificationSent(n.id));
              }}
              aria-label={t('markSent')}
              title={t('markSent')}
              className="shrink-0 rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
            >
              <Check className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
