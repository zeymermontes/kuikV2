'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import type { PosDexie } from '@/lib/pos/db';
import type { RegisterShift, Payment, PaymentMethod } from '@/lib/pos/types';
import { Printer } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { printHtml } from '@/lib/pos/print';
import { PosModal } from './PosModal';

const METHODS: PaymentMethod[] = ['cash', 'card', 'transfer', 'other'];

export function ZReport({
  db,
  shift,
  currency,
  locale,
  onClose,
}: {
  db: PosDexie;
  shift: RegisterShift;
  currency: string;
  locale: string;
  onClose: () => void;
}) {
  const t = useTranslations('pos');
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
    const row = (l: string, v: string) => `<div class="row"><span>${l}</span><span>${v}</span></div>`;
    const methods = METHODS.map((m) => row(`${t(`method_${m}`)} ·${by[m].count}`, money(by[m].amount))).join('');
    printHtml(
      t('zTitle'),
      `<h1>${t('zTitle')}</h1>
       ${row(t('opening'), money(shift.opening_cash))}<hr/>
       ${methods}
       ${tips > 0 ? row(t('tips'), money(tips)) : ''}<hr/>
       <div class="row lg">${row(`${t('totalCharged')} ·${count}`, money(total))}</div><hr/>
       ${row(t('zExpected'), money(shift.expected_cash ?? 0))}
       ${row(t('zCounted'), money(shift.closing_cash ?? 0))}
       <div class="row lg">${row(t('zDiff'), money(shift.over_short ?? 0))}</div>`,
    );
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
