'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Printer, Clock } from 'lucide-react';
import type { PosDexie } from '@/lib/pos/db';
import type { PosTab } from '@/lib/pos/types';
import { formatPrice } from '@/lib/utils';
import { printReceipt } from '@/lib/pos/print';

export function HistoryScreen({
  db,
  shiftId,
  restaurantName,
  currency,
  locale,
  onBack,
}: {
  db: PosDexie;
  shiftId: string | null;
  restaurantName: string;
  currency: string;
  locale: string;
  onBack: () => void;
}) {
  const t = useTranslations('pos');
  const paid = useLiveQuery(() => db.tabs.where('status').equals('paid').toArray(), [db], [] as PosTab[]);
  const list = (paid ?? [])
    .filter((x) => !shiftId || x.shift_id === shiftId)
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));
  const total = list.reduce((s, x) => s + x.total, 0);

  const time = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';

  async function reprint(tab: PosTab) {
    const [items, payments] = await Promise.all([
      db.tab_items.where('tab_id').equals(tab.id).toArray(),
      db.payments.where('tab_id').equals(tab.id).toArray(),
    ]);
    printReceipt(tab, items, payments, restaurantName, currency, locale);
  }

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900">
      <header className="flex items-center gap-2 border-b border-neutral-200 bg-white px-4 py-3">
        <button onClick={onBack} className="rounded-lg p-1.5 hover:bg-neutral-100">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="font-bold">{t('historyTitle')}</h1>
          <p className="text-xs text-neutral-400">
            {list.length} · {formatPrice(total, currency, locale)}
          </p>
        </div>
      </header>

      <div className="p-3">
        {list.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-400">{t('noHistory')}</p>
        ) : (
          <ul className="space-y-2">
            {list.map((tab) => (
              <li key={tab.id} className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-3">
                <div>
                  <p className="font-semibold">{tab.table_label || t('tab')}</p>
                  <p className="flex items-center gap-1 text-xs text-neutral-400">
                    <Clock className="h-3 w-3" /> {time(tab.closed_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-bold">{formatPrice(tab.total, currency, locale)}</span>
                  <button onClick={() => reprint(tab)} className="rounded-lg border border-neutral-300 p-2 text-neutral-500">
                    <Printer className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
