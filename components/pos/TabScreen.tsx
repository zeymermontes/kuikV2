'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import { ChevronLeft, Plus, Minus, Trash2, UtensilsCrossed } from 'lucide-react';
import type { PosDexie } from '@/lib/pos/db';
import type { PosTab, PosMenu, TabItem } from '@/lib/pos/types';
import { addLineToTab, setItemQty, voidItem } from '@/lib/pos/tabs';
import { fireToKitchen } from '@/lib/pos/kitchen';
import { hasOptions } from '@/lib/menu-options';
import { formatPrice } from '@/lib/utils';
import type { Product } from '@/lib/database.types';
import type { CartLine } from '@/lib/whatsapp';
import { ProductSheet } from '@/components/menu/ProductSheet';
import { PaymentSheet } from './PaymentSheet';

export function TabScreen({
  db,
  tab,
  menu,
  tenantId,
  userId,
  shiftId,
  restaurantName,
  currency,
  locale,
  onBack,
  onPaid,
}: {
  db: PosDexie;
  tab: PosTab;
  menu: PosMenu;
  tenantId: string;
  userId: string;
  shiftId: string | null;
  restaurantName: string;
  currency: string;
  locale: string;
  onBack: () => void;
  onPaid: () => void;
}) {
  const t = useTranslations('pos');
  const [activeCat, setActiveCat] = useState<string>(menu.categories[0]?.id ?? '');
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null);
  const [showPay, setShowPay] = useState(false);
  const [query, setQuery] = useState('');

  const items = useLiveQuery(
    () => db.tab_items.where('tab_id').equals(tab.id).toArray(),
    [db, tab.id],
    [] as TabItem[],
  );
  const live = (items ?? []).filter((i) => !i.voided_at);
  const subtotal = live.reduce((s, i) => s + i.line_total, 0);
  const unfired = live.filter((i) => !i.fired_at);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.products.filter((p) =>
      p.is_available && (q ? p.name.toLowerCase().includes(q) : p.category_id === activeCat),
    );
  }, [menu.products, activeCat, query]);

  // Map a product to its kitchen station (category.station, else category name).
  const stationOf = useMemo(() => {
    const catById = new Map(menu.categories.map((c) => [c.id, c]));
    const prodById = new Map(menu.products.map((p) => [p.id, p]));
    return (productId: string | null) => {
      const cat = productId ? catById.get(prodById.get(productId)?.category_id ?? '') : undefined;
      return cat?.station || cat?.name || 'Cocina';
    };
  }, [menu.categories, menu.products]);

  function tapProduct(p: Product) {
    if (hasOptions(p)) {
      setSheetProduct(p);
    } else {
      const line: CartLine = {
        key: p.id,
        productId: p.id,
        name: p.name,
        basePrice: p.price,
        selections: [],
        qty: 1,
      };
      addLineToTab(db, tenantId, tab.id, line);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 text-neutral-900 lg:flex-row">
      {/* Tab / check */}
      <section className="flex flex-col border-b border-neutral-200 bg-white lg:w-2/5 lg:border-b-0 lg:border-r">
        <header className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3">
          <button onClick={onBack} className="rounded-lg p-1.5 hover:bg-neutral-100">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="font-bold">{tab.table_label || t('tab')}</h1>
            <p className="text-xs text-neutral-400">{t('items', { n: live.length })}</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {live.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-400">{t('addHint')}</p>
          ) : (
            live.map((it) => (
              <div key={it.id} className="flex items-start justify-between gap-2 border-b border-neutral-50 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {it.name}
                    {it.fired_at && <span className="ml-1.5 text-[10px] font-semibold text-green-600">{t('fired')}</span>}
                  </p>
                  {it.selections.length > 0 && (
                    <p className="text-xs text-neutral-400">{it.selections.map((s) => s.name).join(', ')}</p>
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    <button onClick={() => setItemQty(db, it, it.qty - 1)} className="rounded bg-neutral-100 p-1">
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-5 text-center text-sm font-semibold">{it.qty}</span>
                    <button onClick={() => setItemQty(db, it, it.qty + 1)} className="rounded bg-neutral-100 p-1">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => voidItem(db, it)} className="ml-1 p-1 text-neutral-300 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <span className="shrink-0 text-sm font-semibold">{formatPrice(it.line_total, currency, locale)}</span>
              </div>
            ))
          )}
        </div>

        <footer className="space-y-2 border-t border-neutral-100 px-4 py-3">
          <div className="flex items-center justify-between text-lg font-bold">
            <span>{t('total')}</span>
            <span>{formatPrice(subtotal, currency, locale)}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => fireToKitchen(db, tenantId, userId, tab, live, stationOf)}
              disabled={unfired.length === 0}
              className="flex-1 rounded-full border border-neutral-300 py-3 font-semibold text-neutral-700 disabled:opacity-40"
            >
              {t('fireKitchen')}{unfired.length > 0 ? ` (${unfired.length})` : ''}
            </button>
            <button
              onClick={() => setShowPay(true)}
              disabled={live.length === 0}
              className="flex-1 rounded-full bg-green-600 py-3 font-semibold text-white disabled:opacity-40"
            >
              {t('charge')}
            </button>
          </div>
        </footer>
      </section>

      {/* Menu */}
      <section className="flex flex-1 flex-col">
        <div className="border-b border-neutral-200 bg-white px-3 pt-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchProducts')}
            className="w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
          />
        </div>
        <div className={`no-scrollbar flex gap-2 overflow-x-auto border-b border-neutral-200 bg-white px-3 py-2 ${query ? 'hidden' : ''}`}>
          {menu.categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium ${
                activeCat === c.id ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="grid flex-1 grid-cols-3 content-start gap-2.5 overflow-y-auto p-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => tapProduct(p)}
              className="group flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white text-left shadow-sm transition active:scale-[0.97]"
            >
              <div className="relative aspect-square w-full bg-neutral-100">
                {p.image_url ? (
                  <Image
                    src={p.image_url}
                    alt={p.name}
                    fill
                    sizes="(min-width:1024px) 18vw, 30vw"
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-neutral-300">
                    <UtensilsCrossed className="h-7 w-7" />
                  </div>
                )}
                {hasOptions(p) && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    +
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col justify-between p-2">
                <p className="line-clamp-2 text-xs font-medium leading-tight">{p.name}</p>
                {p.price != null && (
                  <p className="mt-1 text-xs font-bold text-neutral-700">{formatPrice(p.price, currency, locale)}</p>
                )}
              </div>
            </button>
          ))}
          {products.length === 0 && (
            <p className="col-span-full py-10 text-center text-sm text-neutral-400">—</p>
          )}
        </div>
      </section>

      {sheetProduct && (
        <ProductSheet
          product={sheetProduct}
          showPrice
          currency={currency}
          locale={locale}
          onClose={() => setSheetProduct(null)}
          onConfirm={(line) => addLineToTab(db, tenantId, tab.id, line)}
        />
      )}

      {showPay && (
        <PaymentSheet
          db={db}
          tab={tab}
          tenantId={tenantId}
          userId={userId}
          shiftId={shiftId}
          restaurantName={restaurantName}
          currency={currency}
          locale={locale}
          onClose={() => setShowPay(false)}
          onPaid={() => {
            setShowPay(false);
            onPaid();
          }}
          onFire={() => fireToKitchen(db, tenantId, userId, tab, live, stationOf)}
        />
      )}
    </div>
  );
}
