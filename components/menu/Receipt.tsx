'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { BadgeCheck, Hourglass, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { OrderRow } from '@/lib/database.types';
import { formatPrice, orderCode } from '@/lib/utils';

type Line = { name?: string; qty?: number; selections?: { name?: string }[]; note?: string };

/**
 * The public receipt of one order (/recibo/<id>): what the guest's QR opens
 * and what the counter sees when it scans it. Painted with the restaurant's
 * theme by the tenant layout. Shows nothing the guest did not type themselves.
 */
export function Receipt({
  restaurant,
  logoUrl,
  order,
  currency,
  locale,
  url,
  invoicing = false,
}: {
  restaurant: string;
  logoUrl: string | null;
  order: OrderRow;
  currency: string;
  locale: string;
  url: string;
  /** The restaurant issues CFDIs and lets guests request their own. */
  invoicing?: boolean;
}) {
  const t = useTranslations('menu');
  const items = (order.items ?? []) as Line[];
  const status = order.payment_status;
  const paid = status === 'paid';
  const when = new Date(order.paid_at ?? order.created_at).toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const total = order.amount_paid ?? order.total;

  return (
    <main className="mx-auto min-h-dvh max-w-md px-5 py-10">
      <div className="rounded-3xl border border-[var(--brand-border)] bg-[var(--brand-surface)] p-6 shadow-sm">
        <div className="flex flex-col items-center text-center">
          {logoUrl && <Image src={logoUrl} alt="" width={64} height={64} className="h-16 w-16 rounded-full object-cover" />}
          <h1 className="mt-3 text-lg font-bold">{restaurant}</h1>
          <p className="text-sm text-[var(--brand-text-secondary)]">{t('receiptTitle')}</p>
          <p className="mt-3 font-mono text-3xl font-bold tracking-widest">#{orderCode(order.id)}</p>
          <span
            className={`mt-2 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
              paid ? 'bg-green-100 text-green-700' : status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
            }`}
          >
            {paid ? <BadgeCheck className="h-3.5 w-3.5" /> : status === 'pending' ? <Hourglass className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
            {t(`receiptStatus_${status === 'none' ? 'pending' : status}` as 'receiptStatus_paid')}
          </span>
        </div>

        <dl className="mt-6 space-y-1.5 border-t border-[var(--brand-border)] pt-4 text-sm">
          <Row k={t('receiptDate')} v={when} />
          {order.customer_name && <Row k={t('receiptCustomer')} v={order.customer_name} />}
          {order.service_type && <Row k={t('receiptService')} v={`${order.service_type}${order.table_label ? ` · ${t('table')} ${order.table_label}` : ''}`} />}
        </dl>

        <ul className="mt-4 space-y-2 border-t border-[var(--brand-border)] pt-4 text-sm">
          {items.map((l, i) => (
            <li key={i} className="flex gap-2">
              <span className="font-semibold">{l.qty ?? 1}×</span>
              <span className="min-w-0 flex-1">
                {l.name}
                {l.selections && l.selections.length > 0 && (
                  <span className="block text-xs text-[var(--brand-text-secondary)]">{l.selections.map((s) => s.name).filter(Boolean).join(', ')}</span>
                )}
                {l.note && <span className="block text-xs italic text-[var(--brand-text-secondary)]">{l.note}</span>}
              </span>
            </li>
          ))}
        </ul>

        {total != null && (
          <div className="mt-4 flex items-center justify-between border-t border-[var(--brand-border)] pt-4 text-base font-bold">
            <span>{t('receiptTotal')}</span>
            <span style={{ color: 'var(--brand-primary)' }}>{formatPrice(total, currency, locale)}</span>
          </div>
        )}
        {paid && <p className="mt-1 text-right text-xs text-[var(--brand-text-secondary)]">{t('receiptPaidOnline')}</p>}

        <div className="mt-6 flex flex-col items-center gap-2 border-t border-[var(--brand-border)] pt-5">
          <div className="rounded-xl bg-white p-2 shadow-sm">
            <QRCodeSVG value={url} size={112} level="M" />
          </div>
          <p className="text-center text-xs text-[var(--brand-text-secondary)]">{t('receiptQrHint')}</p>
        </div>
      </div>
      {invoicing && (
        <Link href={`/factura?o=${order.id}`} className="mt-6 block rounded-full border border-[var(--brand-border)] py-3 text-center text-sm font-semibold">
          {t('receiptInvoice')}
        </Link>
      )}
      <Link href="/menu" className="mt-6 block text-center text-sm font-semibold underline-offset-4 hover:underline">
        {t('receiptBackToMenu')}
      </Link>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--brand-text-secondary)]">{k}</dt>
      <dd className="text-right">{v}</dd>
    </div>
  );
}
