'use client';

import { useEffect, useState } from 'react';
import { Clock, UtensilsCrossed, ShoppingBag, Check, RefreshCw } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { OrderRow, OrderStatus } from '@/lib/database.types';
import { formatPrice } from '@/lib/utils';
import { listOrders, setOrderStatus } from '@/app/(dashboard)/orders/actions';

type Line = { name?: string; qty?: number; selections?: { name?: string }[] };

const COLUMNS: { status: OrderStatus; next: OrderStatus; tone: string }[] = [
  { status: 'new', next: 'preparing', tone: 'border-blue-200 bg-blue-50' },
  { status: 'preparing', next: 'ready', tone: 'border-amber-200 bg-amber-50' },
  { status: 'ready', next: 'done', tone: 'border-green-200 bg-green-50' },
];

export function OrdersBoard({ initial, currency }: { initial: OrderRow[]; currency: string }) {
  const t = useTranslations('orders');
  const locale = useLocale();
  const [orders, setOrders] = useState<OrderRow[]>(initial);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      setOrders(await listOrders());
    } catch {
      // keep current
    } finally {
      setRefreshing(false);
    }
  }

  // Poll for new/updated orders every 10s.
  useEffect(() => {
    const id = setInterval(refresh, 10_000);
    return () => clearInterval(id);
  }, []);

  function advance(o: OrderRow, next: OrderStatus) {
    setOrders((cur) =>
      next === 'done' ? cur.filter((x) => x.id !== o.id) : cur.map((x) => (x.id === o.id ? { ...x, status: next } : x)),
    );
    setOrderStatus(o.id, next).catch(() => {});
  }

  const time = (iso: string) => new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm text-neutral-500">{t('liveHint')}</span>
        <button
          onClick={refresh}
          className="flex items-center gap-1.5 rounded-lg border border-neutral-300 px-2.5 py-1 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> {t('refresh')}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = orders.filter((o) => o.status === col.status);
          return (
            <div key={col.status} className={`rounded-2xl border p-3 ${col.tone}`}>
              <h2 className="mb-3 flex items-center justify-between font-semibold">
                {t(`status_${col.status}`)}
                <span className="rounded-full bg-white/70 px-2 py-0.5 text-xs">{items.length}</span>
              </h2>
              <div className="space-y-3">
                {items.length === 0 && <p className="py-6 text-center text-sm text-neutral-400">{t('emptyCol')}</p>}
                {items.map((o) => (
                  <div key={o.id} className="rounded-xl bg-white p-3 shadow-sm">
                    <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {time(o.created_at)}
                      </span>
                      {o.total != null && <span className="font-semibold text-neutral-700">{formatPrice(o.total, currency)}</span>}
                    </div>
                    <div className="mb-1.5 flex flex-wrap items-center gap-2 text-sm font-medium">
                      {o.customer_name && <span>{o.customer_name}</span>}
                      {o.service_type && (
                        <span className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
                          {o.service_type === 'dinein' ? <UtensilsCrossed className="h-3 w-3" /> : <ShoppingBag className="h-3 w-3" />}
                          {o.service_type}
                          {o.table_label ? ` · ${t('table')} ${o.table_label}` : ''}
                        </span>
                      )}
                    </div>
                    <ul className="space-y-0.5 text-sm">
                      {((o.items ?? []) as Line[]).map((l, i) => (
                        <li key={i}>
                          <span className="font-medium">{l.qty ?? 1}×</span> {l.name}
                          {l.selections && l.selections.length > 0 && (
                            <span className="text-neutral-400"> · {l.selections.map((s) => s.name).join(', ')}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <button
                      onClick={() => advance(o, col.next)}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white"
                    >
                      <Check className="h-4 w-4" /> {t(`advance_${col.status}`)}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
