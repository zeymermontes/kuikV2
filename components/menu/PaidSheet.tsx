'use client';

import { useEffect, useState } from 'react';
import { selectionsText } from '@/lib/menu-options';
import { useTranslations } from 'next-intl';
import { Check, Loader2, MessageCircle, Receipt as ReceiptIcon, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { buildWhatsappUrl } from '@/lib/whatsapp';
import { formatPrice, orderCode } from '@/lib/utils';

type Status = 'checking' | 'paid' | 'pending' | 'failed';

interface OrderInfo {
  payment_status?: string;
  amount_paid?: number | null;
  total?: number | null;
  items?: { name?: string; qty?: number; selections?: { name?: string }[] }[];
}

/**
 * The guest is back from the gateway. Confirm the payment with Kuik (the
 * webhook usually lands before the redirect, but not always), then show the
 * order number, what was ordered and a QR of the receipt to show at the
 * counter, and hand the saved order text to WhatsApp marked as paid. If
 * storage was wiped meanwhile the restaurant still has the paid order on its
 * board; the button just says so.
 */
export function PaidSheet({
  tenantId,
  orderId,
  fallbackPhone,
  currency,
  locale,
  onClose,
}: {
  tenantId: string;
  orderId: string;
  fallbackPhone: string | null;
  currency: string;
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations('menu');
  const [status, setStatus] = useState<Status>('checking');
  const [order, setOrder] = useState<OrderInfo | null>(null);
  // Only ever rendered after the menu read the URL on the client, so storage
  // is there to read on first render.
  const [saved] = useState<{ message: string; phone: string | null } | null>(() => {
    try {
      const raw = typeof window === 'undefined' ? null : localStorage.getItem(`kuik:paid:${orderId}`);
      return raw ? (JSON.parse(raw) as { message: string; phone: string | null }) : null;
    } catch {
      return null;
    }
  });
  const [receiptUrl] = useState(() => (typeof window === 'undefined' ? '' : `${window.location.origin}/recibo/${orderId}`));

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/order/${tenantId}?id=${orderId}`);
        const d = (await res.json()) as { ok: boolean } & OrderInfo;
        if (stopped) return;
        if (d.ok) setOrder(d);
        if (d.ok && d.payment_status === 'paid') {
          setStatus('paid');
          return;
        }
        if (d.ok && (d.payment_status === 'failed' || d.payment_status === 'refunded')) {
          setStatus('failed');
          return;
        }
      } catch {
        /* retry */
      }
      // Card payments confirm within a second or two; OXXO / SPEI can take
      // longer than anyone will wait here, so after ~20 s we say "pending".
      if (++tries >= 10) {
        setStatus('pending');
        return;
      }
      timer = setTimeout(tick, 2000);
    };
    tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [tenantId, orderId]);

  const code = orderCode(orderId);
  const phone = saved?.phone ?? fallbackPhone;
  const message = saved?.message ?? t('paidFallbackMessage', { id: code });
  const amount = order?.amount_paid ?? order?.total ?? null;
  const items = order?.items ?? [];
  const done = status === 'paid' || status === 'pending';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={status === 'checking' ? undefined : onClose} />
      <div
        className="animate-slide-up pb-safe relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[var(--sheet-radius)] p-6 text-center sm:rounded-[var(--sheet-radius)]"
        style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)', fontFamily: 'var(--brand-font)' }}
      >
        {status !== 'checking' && (
          <button onClick={onClose} aria-label="close" className="absolute right-3 top-3 p-1 text-[var(--brand-text-secondary)]">
            <X className="h-5 w-5" />
          </button>
        )}
        <div
          className={`mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full ${
            status === 'paid' ? 'bg-green-100 text-green-600' : status === 'failed' ? 'bg-red-100 text-red-600' : 'bg-[var(--brand-surface)]'
          }`}
        >
          {status === 'paid' ? <Check className="h-8 w-8" /> : status === 'failed' ? <X className="h-8 w-8" /> : <Loader2 className="h-8 w-8 animate-spin" />}
        </div>
        <h2 className="text-xl font-bold">
          {status === 'paid' ? t('paidTitle') : status === 'failed' ? t('payFailedTitle') : status === 'pending' ? t('payPendingTitle') : t('payCheckingTitle')}
        </h2>
        <p className="mt-1 text-sm text-[var(--brand-text-secondary)]">
          {status === 'paid'
            ? amount != null
              ? t('paidBodyAmount', { amount: formatPrice(amount, currency, locale) })
              : t('paidBody')
            : status === 'failed'
              ? t('payFailedBody')
              : status === 'pending'
                ? t('payPendingBody')
                : t('payCheckingBody')}
        </p>

        {done && (
          <div className="mt-5 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-4 text-left">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--brand-text-secondary)]">{t('orderNumber')}</p>
                <p className="font-mono text-2xl font-bold tracking-wider">#{code}</p>
              </div>
              <a href={receiptUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-xl bg-white p-1.5 shadow-sm" aria-label={t('viewReceipt')}>
                <QRCodeSVG value={receiptUrl} size={84} level="M" />
              </a>
            </div>
            {items.length > 0 && (
              <ul className="mt-3 space-y-1 border-t border-[var(--brand-border)] pt-3 text-sm">
                {items.map((l, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-semibold">{l.qty ?? 1}×</span>
                    <span className="min-w-0 flex-1">
                      {l.name}
                      {l.selections && l.selections.length > 0 && (
                        <span className="block text-xs text-[var(--brand-text-secondary)]">{selectionsText(l.selections)}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-[var(--brand-text-secondary)]">{t('receiptQrHint')}</p>
            <a href={receiptUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline">
              <ReceiptIcon className="h-4 w-4" /> {t('viewReceipt')}
            </a>
          </div>
        )}

        {done && phone && (
          <a
            href={buildWhatsappUrl(phone, message)}
            target="_blank"
            rel="noreferrer"
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-3.5 font-semibold text-white"
          >
            <MessageCircle className="h-5 w-5" /> {t('sendPaidWhatsapp')}
          </a>
        )}
        {status === 'paid' && <p className="mt-2 text-xs text-[var(--brand-text-secondary)]">{t('sendPaidHint')}</p>}
        {status !== 'checking' && (
          <button onClick={onClose} className="mt-3 w-full py-2 text-sm text-[var(--brand-text-secondary)]">
            {status === 'failed' ? t('backToOrder') : t('close')}
          </button>
        )}
      </div>
    </div>
  );
}
