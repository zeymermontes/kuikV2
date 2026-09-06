'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Ban, Check, Search } from 'lucide-react';
import type { Product } from '@/lib/database.types';
import type { PosDexie } from '@/lib/pos/db';
import type { PosMenu } from '@/lib/pos/types';
import { optionCatalog, productOptions, setOptionAvailable, setProductAvailable } from '@/lib/pos/availability';
import { PosModal } from './PosModal';

/**
 * "Agotados": mark a product or an option sold out from the register, and
 * bring it back. Opened from the chip in the category strip (everything at a
 * glance, sold-out first) or by holding a product tile, in which case that
 * product and its own options come first.
 */
export function AvailabilitySheet({
  db,
  tenantId,
  menu,
  product,
  demo,
  onClose,
}: {
  db: PosDexie;
  tenantId: string;
  menu: PosMenu;
  /** The product the sheet was opened from, if any. */
  product?: Product | null;
  demo?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('pos');
  const [tab, setTab] = useState<'products' | 'options'>('products');
  const [query, setQuery] = useState('');

  const focus = product ? (menu.products.find((p) => p.id === product.id) ?? product) : null;
  const q = query.trim().toLowerCase();

  const products = useMemo(() => {
    const list = menu.products.filter((p) => !focus || p.id !== focus.id);
    const hit = q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
    return [...hit].sort((a, b) => Number(a.is_available) - Number(b.is_available) || a.name.localeCompare(b.name));
  }, [menu.products, focus, q]);

  const options = useMemo(() => {
    const all = optionCatalog(menu);
    return q ? all.filter((o) => o.name.toLowerCase().includes(q)) : all;
  }, [menu, q]);

  const focusOptions = useMemo(() => (focus ? optionCatalog(menu, [focus]) : []), [menu, focus]);
  const catName = useMemo(() => new Map(menu.categories.map((c) => [c.id, c.name] as const)), [menu.categories]);

  const toggleProduct = (p: Product) => void setProductAvailable(db, p.id, !p.is_available, demo);
  const toggleOption = (name: string, available: boolean) => void setOptionAvailable(db, tenantId, name, !available, demo);

  const row = 'flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-black/5';
  const btn = (out: boolean) =>
    `flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
      out ? 'bg-red-50 text-red-600 ring-1 ring-red-200' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
    }`;

  return (
    <PosModal title={t('availability')} onClose={onClose}>
      <p className="mb-3 text-xs text-neutral-500">{t('availabilityHint')}</p>

      {focus && (
        <div className="mb-4 space-y-2 rounded-2xl bg-neutral-50 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{t('thisProduct')}</p>
          <div className={row}>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{focus.name}</span>
            <button type="button" onClick={() => toggleProduct(focus)} className={btn(!focus.is_available)}>
              {focus.is_available ? <Ban className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              {focus.is_available ? t('markSoldOut') : t('availableAgain')}
            </button>
          </div>
          {focusOptions.length > 0 && (
            <>
              <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{t('itsOptions')}</p>
              {focusOptions.map((o) => (
                <div key={o.name} className={row}>
                  <span className="min-w-0 flex-1 truncate text-sm">{o.name}</span>
                  <button type="button" onClick={() => toggleOption(o.name, o.available)} className={btn(!o.available)}>
                    {o.available ? <Ban className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                    {o.available ? t('markSoldOut') : t('availableAgain')}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <div className="flex rounded-xl bg-neutral-100 p-1 text-sm font-semibold">
          {(['products', 'options'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`rounded-lg px-3 py-1.5 transition ${tab === k ? 'bg-white shadow-sm' : 'text-neutral-500'}`}
            >
              {k === 'products' ? t('availabilityProducts') : t('availabilityOptions')}
            </button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('availabilitySearch')}
            className="w-full rounded-xl border border-neutral-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-neutral-900"
          />
        </div>
      </div>

      <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-0.5">
        {tab === 'products' &&
          products.map((p) => (
            <div key={p.id} className={row}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.name}</span>
                <span className="block truncate text-[11px] text-neutral-400">
                  {catName.get(p.category_id) ?? ''}
                  {productOptions(p).some((o) => o.available === false) ? ` · ${t('availabilityOptions').toLowerCase()}` : ''}
                </span>
              </span>
              <button type="button" onClick={() => toggleProduct(p)} className={btn(!p.is_available)}>
                {p.is_available ? <Ban className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                {p.is_available ? t('markSoldOut') : t('availableAgain')}
              </button>
            </div>
          ))}
        {tab === 'options' &&
          options.map((o) => (
            <div key={o.name} className={row}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{o.name}</span>
                <span className="block text-[11px] text-neutral-400">{t('optionInProducts', { n: o.products })}</span>
              </span>
              <button type="button" onClick={() => toggleOption(o.name, o.available)} className={btn(!o.available)}>
                {o.available ? <Ban className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                {o.available ? t('markSoldOut') : t('availableAgain')}
              </button>
            </div>
          ))}
        {((tab === 'products' && products.length === 0) || (tab === 'options' && options.length === 0)) && (
          <p className="py-8 text-center text-sm text-neutral-400">{q ? t('noProducts') : t('availabilityEmpty')}</p>
        )}
      </div>
    </PosModal>
  );
}
