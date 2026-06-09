'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, Plus, Minus, Trash2 } from 'lucide-react';
import type { PosDexie } from '@/lib/pos/db';
import type { PosTab, PosMenu, TabItem } from '@/lib/pos/types';
import { addLineToTab, setItemQty, voidItem } from '@/lib/pos/tabs';
import { hasOptions } from '@/lib/menu-options';
import { formatPrice } from '@/lib/utils';
import type { Product } from '@/lib/database.types';
import type { CartLine } from '@/lib/whatsapp';
import { ProductSheet } from '@/components/menu/ProductSheet';

export function TabScreen({
  db,
  tab,
  menu,
  tenantId,
  currency,
  locale,
  onBack,
}: {
  db: PosDexie;
  tab: PosTab;
  menu: PosMenu;
  tenantId: string;
  currency: string;
  locale: string;
  onBack: () => void;
}) {
  const [activeCat, setActiveCat] = useState<string>(menu.categories[0]?.id ?? '');
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null);

  const items = useLiveQuery(
    () => db.tab_items.where('tab_id').equals(tab.id).toArray(),
    [db, tab.id],
    [] as TabItem[],
  );
  const live = (items ?? []).filter((i) => !i.voided_at);
  const subtotal = live.reduce((s, i) => s + i.line_total, 0);

  const products = useMemo(
    () => menu.products.filter((p) => p.category_id === activeCat && p.is_available),
    [menu.products, activeCat],
  );

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
            <h1 className="font-bold">{tab.table_label || 'Cuenta'}</h1>
            <p className="text-xs text-neutral-400">{live.length} artículos</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-2">
          {live.length === 0 ? (
            <p className="py-10 text-center text-sm text-neutral-400">Agrega productos del menú →</p>
          ) : (
            live.map((it) => (
              <div key={it.id} className="flex items-start justify-between gap-2 border-b border-neutral-50 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{it.name}</p>
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

        <footer className="border-t border-neutral-100 px-4 py-3">
          <div className="flex items-center justify-between text-lg font-bold">
            <span>Total</span>
            <span>{formatPrice(subtotal, currency, locale)}</span>
          </div>
        </footer>
      </section>

      {/* Menu */}
      <section className="flex flex-1 flex-col">
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-neutral-200 bg-white px-3 py-2">
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
        <div className="grid flex-1 grid-cols-2 gap-2 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => tapProduct(p)}
              className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-white p-3 text-left active:bg-neutral-100"
            >
              <span className="text-sm font-medium">{p.name}</span>
              {p.price != null && (
                <span className="mt-2 text-sm text-neutral-500">{formatPrice(p.price, currency, locale)}</span>
              )}
            </button>
          ))}
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
    </div>
  );
}
