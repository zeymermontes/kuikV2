'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, MessageCircle, X } from 'lucide-react';
import { buildWhatsappUrl } from '@/lib/whatsapp';
import { formatPrice } from '@/lib/utils';

type Status = 'checking' | 'paid' | 'pending' | 'failed';

/**
 * The guest is back from the gateway. Confirm the payment with Kuik (the
 * webhook usually lands before the redirect, but not always), then hand the
 * saved order text to WhatsApp marked as paid. If storage was wiped meanwhile
 * the restaurant still has the paid order on its board; the button just says so.
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
  const [amount, setAmount] = useState<number | null>(null);
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

  useEffect(() => {
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/order/${tenantId}?id=${orderId}`);
        const d = (await res.json()) as { ok: boolean; payment_status?: string; amount_paid?: number | null };
        if (stopped) return;
        if (d.ok && d.payment_status === 'paid') {
          setAmount(d.amount_paid ?? null);
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

  const phone = saved?.phone ?? fallbackPhone;
  const message = saved?.message ?? t('paidFallbackMessage', { id: orderId.slice(0, 8) });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={status === 'checking' ? undefined : onClose} />
      <div
        className="animate-slide-up pb-safe relative w-full max-w-md rounded-t-[var(--sheet-radius)] p-6 text-center sm:rounded-[var(--sheet-radius)]"
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

        {(status === 'paid' || status === 'pending') && phone && (
          <a
            href={buildWhatsappUrl(phone, message)}
            target="_blank"
            rel="noreferrer"
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] py-3.5 font-semibold text-white"
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
