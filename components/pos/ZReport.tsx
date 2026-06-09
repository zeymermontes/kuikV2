'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import type { PosDexie } from '@/lib/pos/db';
import type { RegisterShift, Payment, PaymentMethod } from '@/lib/pos/types';
import { formatPrice } from '@/lib/utils';
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

      <button onClick={onClose} className="mt-5 w-full rounded-full bg-neutral-900 py-3 font-semibold text-white">
        {t('done')}
      </button>
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
