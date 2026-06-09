'use client';

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronDown, ChevronRight, Printer, Clock, RotateCcw } from 'lucide-react';
import type { PosDexie } from '@/lib/pos/db';
import type { PosTab, TabItem } from '@/lib/pos/types';
import { formatPrice } from '@/lib/utils';
import { printReceipt } from '@/lib/pos/print';
import { reopenTab } from '@/lib/pos/tabs';

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

  async function reopen(tab: PosTab) {
    await reopenTab(db, tab);
    onBack();
  }
  const list = (paid ?? [])
    .filter((x) => !shiftId || x.shift_id === shiftId)
    .sort((a, b) => (b.closed_at ?? '').localeCompare(a.closed_at ?? ''));
  const total = list.reduce((s, x) => s + x.total, 0);

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
              <HistoryRow
                key={tab.id}
                db={db}
                tab={tab}
                currency={currency}
                locale={locale}
                onReprint={() => reprint(tab)}
                onReopen={() => reopen(tab)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HistoryRow({
  db,
  tab,
  currency,
  locale,
  onReprint,
  onReopen,
}: {
  db: PosDexie;
  tab: PosTab;
  currency: string;
  locale: string;
  onReprint: () => void;
  onReopen: () => void;
}) {
  const t = useTranslations('pos');
  const [open, setOpen] = useState(false);
  const items = useLiveQuery(
    () => (open ? db.tab_items.where('tab_id').equals(tab.id).toArray() : Promise.resolve([] as TabItem[])),
    [db, tab.id, open],
    [] as TabItem[],
  );
  const live = (items ?? []).filter((i) => !i.voided_at);
  const time = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <li className="rounded-2xl border border-neutral-200 bg-white">
      <div className="flex items-center justify-between p-3">
        <button onClick={() => setOpen((v) => !v)} className="flex flex-1 items-center gap-2 text-left">
          {open ? <ChevronDown className="h-4 w-4 text-neutral-400" /> : <ChevronRight className="h-4 w-4 text-neutral-400" />}
          <div>
            <p className="font-semibold">{tab.table_label || t('tab')}</p>
            <p className="flex items-center gap-1 text-xs text-neutral-400">
              <Clock className="h-3 w-3" /> {time(tab.closed_at)}
            </p>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <span className="font-bold">{formatPrice(tab.total, currency, locale)}</span>
          <button onClick={onReprint} title={t('reprint')} className="rounded-lg border border-neutral-300 p-2 text-neutral-500">
            <Printer className="h-4 w-4" />
          </button>
          <button onClick={onReopen} title={t('reopen')} className="rounded-lg border border-neutral-300 p-2 text-neutral-500">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </div>
      {open && (
        <div className="border-t border-neutral-100 px-3 py-2">
          <ul className="space-y-1 text-sm">
            {live.map((it) => (
              <li key={it.id} className="flex justify-between">
                <span>
                  {it.qty}× {it.name}
                  {it.selections.length > 0 && (
                    <span className="text-neutral-400"> · {it.selections.map((s) => s.name).join(', ')}</span>
                  )}
                </span>
                <span className="text-neutral-500">{formatPrice(it.line_total, currency, locale)}</span>
              </li>
            ))}
            {live.length === 0 && <li className="text-neutral-400">—</li>}
          </ul>
          {tab.discount > 0 && (
            <p className="mt-1 text-xs text-green-600">
              {t('discount')} − {formatPrice(tab.discount, currency, locale)}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
