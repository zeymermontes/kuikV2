'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import type { PosDexie } from '@/lib/pos/db';
import type { RegisterShift, Payment, PaymentMethod } from '@/lib/pos/types';
import { Printer, Download } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { printReport } from '@/lib/pos/printing';
import { zReportDoc } from '@/lib/pos/print-doc';
import { usePrinting, useZLabels } from './PrintingContext';
import { PosModal } from './PosModal';

const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

export function ZReport({
  db,
  shift,
  restaurantName = '',
  currency,
  locale,
  onClose,
}: {
  db: PosDexie;
  shift: RegisterShift;
  restaurantName?: string;
  currency: string;
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations('pos');
  const printing = usePrinting();
  const zLabels = useZLabels();
  const money = (n: number) => formatPrice(n, currency, locale);

  const payments = useLiveQuery(
    () => db.payments.where('shift_id').equals(shift.id).toArray(),
    [db, shift.id],
    [] as Payment[],
  );

  const by: Record<PaymentMethod, { count: number; amount: number }> = {
    cash: { count: 0, amount: 0 },
    card: { count: 0, amount: 0 },
    transfer: { count: 0, amount: 0 },
    other: { count: 0, amount: 0 },
  };
  let tips = 0;
  let total = 0;
  for (const p of payments ?? []) {
    by[p.method].count++;
    by[p.method].amount += p.amount;
    tips += p.tip;
    total += p.amount;
  }
  const count = (payments ?? []).length;

  function printZ() {
    printReport(printing, zReportDoc(shift, payments ?? [], { restaurant: restaurantName, locale, money, labels: zLabels }), shift.id);
  }

  function downloadZ() {
    const line = (l: string, v: string) => `${l}\t${v}`;
    const lines = [
      t('zTitle'),
      line(t('opening'), money(shift.opening_cash)),
      '',
      ...METHODS.map((m) => line(`${t(`method_${m}`)} (${by[m].count})`, money(by[m].amount))),
      tips > 0 ? line(t('tips'), money(tips)) : '',
      line(`${t('totalCharged')} (${count})`, money(total)),
      '',
      line(t('zExpected'), money(shift.expected_cash ?? 0)),
      line(t('zCounted'), money(shift.closing_cash ?? 0)),
      line(t('zDiff'), money(shift.over_short ?? 0)),
    ].filter(Boolean);
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `z-report-${(shift.closed_at ?? shift.opened_at).slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PosModal title={t('zTitle')} onClose={onClose}>
      <dl className="space-y-1.5 text-sm">
        <Row label={t('opening')} value={money(shift.opening_cash)} muted />

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t('byMethodTitle')}</p>
        {METHODS.map((m) => (
          <Row key={m} label={`${t(`method_${m}`)}${by[m].count ? ` ·${by[m].count}` : ''}`} value={money(by[m].amount)} />
        ))}
        {tips > 0 && <Row label={t('tips')} value={money(tips)} muted />}

        <div className="mt-2 border-t border-neutral-100 pt-2">
          <Row label={`${t('totalCharged')} ·${count}`} value={money(total)} bold />
        </div>

        <p className="pt-3 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t('zTitle')}</p>
        <Row label={t('zExpected')} value={money(shift.expected_cash ?? 0)} muted />
        <Row label={t('zCounted')} value={money(shift.closing_cash ?? 0)} muted />
        <div className="border-t border-neutral-100 pt-2">
          <Row
            label={t('zDiff')}
            value={money(shift.over_short ?? 0)}
            bold
            tone={shift.over_short && shift.over_short < 0 ? 'text-red-600' : 'text-green-600'}
          />
        </div>
      </dl>

      <div className="mt-5 flex gap-2">
        <button onClick={printZ} className="flex flex-1 items-center justify-center gap-2 rounded-full border border-neutral-300 py-3 font-semibold text-neutral-700">
          <Printer className="h-5 w-5" /> {t('printZ')}
        </button>
        <button onClick={downloadZ} title={t('exportTxt')} className="flex items-center justify-center rounded-full border border-neutral-300 px-4 py-3 text-neutral-700">
          <Download className="h-5 w-5" />
        </button>
        <button onClick={onClose} className="flex-1 rounded-full bg-neutral-900 py-3 font-semibold text-white">
          {t('done')}
        </button>
      </div>
    </PosModal>
  );
}

function Row({
  label,
  value,
  muted,
  bold,
  tone,
}: {
  label: string;
  value: string;
  muted?: boolean;
  bold?: boolean;
  tone?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={muted ? 'text-neutral-500' : ''}>{label}</dt>
      <dd className={`${bold ? 'font-bold' : 'font-medium'} ${tone ?? ''}`}>{value}</dd>
    </div>
  );
}
