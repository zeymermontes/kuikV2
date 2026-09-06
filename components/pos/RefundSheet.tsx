'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { PosDexie } from '@/lib/pos/db';
import type { Payment, PaymentMethod, PosTab, TabItem } from '@/lib/pos/types';
import { refundTab } from '@/lib/pos/payments';
import { refundDoc } from '@/lib/pos/print-doc';
import { printReport } from '@/lib/pos/printing';
import { formatPrice } from '@/lib/utils';
import { NumPad } from './NumPad';
import { PosModal } from './PosModal';
import { useEmployee } from './EmployeeContext';
import { usePrinting, useReceiptLabels } from './PrintingContext';

const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

/**
 * Money back on a paid sale: tick the lines that come back or type an
 * amount, say why, say how it is paid out. The refund is a negative payment
 * in the current shift; a slip prints and the drawer opens for cash.
 */
export function RefundSheet({
  db,
  tab,
  items,
  payments,
  tenantId,
  userId,
  shiftId,
  restaurantName,
  currency,
  locale,
  onClose,
}: {
  db: PosDexie;
  tab: PosTab;
  items: TabItem[];
  payments: Payment[];
  tenantId: string;
  userId: string;
  shiftId: string | null;
  restaurantName: string;
  currency: string;
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations('pos');
  const printing = usePrinting();
  const labels = useReceiptLabels();
  const { current: employee } = useEmployee();
  const money = (n: number) => formatPrice(n, currency, locale);

  const live = items.filter((i) => !i.voided_at);
  const sales = payments.filter((p) => p.kind !== 'refund');
  const max = Math.max(0, Math.round((tab.total - (tab.refunded ?? 0)) * 100) / 100);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [custom, setCustom] = useState('');
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<PaymentMethod>(sales[0]?.method ?? 'cash');
  const [busy, setBusy] = useState(false);

  const pickedItems = useMemo(() => live.filter((i) => picked.has(i.id)), [live, picked]);
  const pickedTotal = Math.round(pickedItems.reduce((s, i) => s + i.line_total, 0) * 100) / 100;
  const amount = Math.min(max, custom ? Number(custom) || 0 : pickedTotal);

  function toggle(id: string) {
    setCustom('');
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function confirm() {
    if (amount <= 0 || busy) return;
    setBusy(true);
    try {
      const refund = await refundTab(db, {
        tenantId,
        tab,
        amount,
        method,
        reason: reason.trim() || null,
        items: custom ? [] : pickedItems.map((i) => ({ name: i.name, qty: i.qty, amount: i.line_total })),
        refundOf: sales.find((p) => p.method === method)?.id ?? sales[0]?.id ?? null,
        shiftId,
        userId,
        employeeId: employee?.id ?? null,
      });
      const drawer = method === 'cash' && printing.settings.drawerCash;
      printReport(printing, refundDoc(tab, refund, { restaurant: restaurantName, locale, money, labels, drawer }), refund.id, false);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  const INPUT = 'w-full rounded-xl border border-neutral-200 px-3 py-3 text-base focus:border-pos-accent focus:outline-none';

  return (
    <PosModal title={t('refundTitle')} onClose={onClose}>
      <div className="max-h-[70dvh] overflow-y-auto pr-1">
        <p className="mb-2 text-xs font-medium text-neutral-500">{t('refundLines')}</p>
        <ul className="mb-3 divide-y divide-neutral-100 rounded-xl border border-neutral-200 text-sm">
          {live.map((i) => (
            <li key={i.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
                <input type="checkbox" checked={picked.has(i.id)} onChange={() => toggle(i.id)} />
                <span className="min-w-0 flex-1 truncate">
                  {i.qty}× {i.name}
                </span>
                <span className="text-neutral-500">{money(i.line_total)}</span>
              </label>
            </li>
          ))}
        </ul>

        <p className="mb-1 text-xs font-medium text-neutral-500">
          {t('refundOther')} · {t('refundMax', { x: money(max) })}
        </p>
        <input
          readOnly
          inputMode="none"
          value={custom}
          onFocus={() => setPicked(new Set())}
          placeholder={String(max)}
          className={`${INPUT} mb-2 ${custom ? 'border-pos-accent' : ''}`}
        />
        <div className="mb-3">
          <NumPad
            value={custom}
            onChange={(v) => {
              setPicked(new Set());
              setCustom(v);
            }}
          />
        </div>

        <p className="mb-1 text-xs font-medium text-neutral-500">{t('refundReason')}</p>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('refundReasonPh')} className={`${INPUT} mb-3`} />

        <p className="mb-1 text-xs font-medium text-neutral-500">{t('refundMethod')}</p>
        <div className="mb-4 grid grid-cols-4 gap-2">
          {METHODS.map((m) => (
            <button
              key={m}
              onClick={() => setMethod(m)}
              className={`rounded-xl border py-2 text-sm font-medium ${method === m ? 'border-pos-accent bg-pos-accent text-pos-accent-text' : 'border-neutral-200 text-neutral-600'}`}
            >
              {t(`method_${m}`)}
            </button>
          ))}
        </div>
      </div>

      <button onClick={confirm} disabled={amount <= 0 || busy} className="mt-2 w-full rounded-full bg-red-600 py-3.5 font-semibold text-white hover:bg-red-700 disabled:opacity-40">
        {t('refundConfirm', { x: money(amount) })}
      </button>
    </PosModal>
  );
}
