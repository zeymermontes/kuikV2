'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { Search, X, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { MenuCategory, Product } from '@/lib/database.types';
import { formatPrice } from '@/lib/utils';

/** Where a result lives: the top-level section it belongs to, and the element to land on. */
export interface SearchTarget {
  catId: string;
  elementId: string;
  kind: 'section' | 'product';
}

/** Lower-cased and stripped of accents, so "cafe" finds "Café". */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

interface SectionHit {
  id: string;
  catId: string;
  name: string;
  parent: string | null;
  count: number;
}
interface ProductHit {
  product: Product;
  catId: string;
  path: string;
}

/**
 * Full-screen quick search over the whole menu. With nothing typed it is a
 * table of contents — every section with its subsections, which the chip strip
 * has no room for; typing narrows it to matching sections and products. Picking
 * a result hands its target back, and the menu scrolls to it.
 */
export function MenuSearch({
  menu,
  anchor,
  hideSoldOut,
  showPrices,
  currency,
  locale,
  onPick,
  onClose,
}: {
  menu: MenuCategory[];
  anchor: (id: string) => string;
  hideSoldOut: boolean;
  showPrices: boolean;
  currency: string;
  locale: string;
  onPick: (target: SearchTarget) => void;
  onClose: () => void;
}) {
  const t = useTranslations('menu');
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    // The page behind must not scroll under the overlay.
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const index = useMemo(() => {
    const sections: SectionHit[] = [];
    const products: ProductHit[] = [];
    const take = (entries: MenuCategory['entries'], catId: string, path: string) => {
      let n = 0;
      for (const e of entries) {
        if (e.kind === 'separator') continue;
        if (hideSoldOut && !e.is_available) continue;
        products.push({ product: e, catId, path });
        n++;
      }
      return n;
    };
    for (const cat of menu) {
      const own = take(cat.entries, cat.id, cat.name);
      const subs: SectionHit[] = [];
      for (const sub of cat.subcategories) {
        const count = take(sub.entries, cat.id, `${cat.name} › ${sub.name}`);
        if (count > 0) subs.push({ id: sub.id, catId: cat.id, name: sub.name, parent: cat.name, count });
      }
      const count = own + subs.reduce((a, s) => a + s.count, 0);
      if (count > 0) sections.push({ id: cat.id, catId: cat.id, name: cat.name, parent: null, count }, ...subs);
    }
    return { sections, products };
  }, [menu, hideSoldOut]);

  const q = fold(query.trim());
  const sectionHits = q ? index.sections.filter((s) => fold(s.name).includes(q)) : index.sections;
  const productHits = useMemo(() => {
    if (!q) return [];
    // Name matches first, then the ones that only match in the description.
    const byName = index.products.filter((p) => fold(p.product.name).includes(q));
    const byText = index.products.filter(
      (p) => !fold(p.product.name).includes(q) && fold(p.product.description ?? '').includes(q),
    );
    return [...byName, ...byText].slice(0, 60);
  }, [q, index.products]);

  const empty = q !== '' && sectionHits.length === 0 && productHits.length === 0;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={t('search')}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto flex w-full max-w-xl items-center gap-2 px-4 pb-2 pt-4">
        <div
          className="flex min-w-0 flex-1 items-center gap-2 rounded-full border px-4 py-2.5"
          style={{ backgroundColor: 'var(--search-bg)', color: 'var(--search-text)', borderColor: 'var(--search-border)' }}
        >
          <Search className="h-4 w-4 shrink-0 opacity-50" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            enterKeyHint="search"
            // 16px keeps iOS from zooming the page when the field takes focus.
            className="w-full bg-transparent text-base outline-none placeholder:opacity-50"
            style={{ color: 'var(--search-text)' }}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label={t('clearSearch')} className="shrink-0 opacity-50 hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button type="button" onClick={onClose} className="shrink-0 px-1 text-sm font-medium" style={{ color: 'var(--brand-primary)' }}>
          {t('searchClose')}
        </button>
      </div>

      <div className="mx-auto w-full max-w-xl flex-1 overflow-y-auto overscroll-contain px-4 pb-10">
        {empty && <p className="py-10 text-center text-sm opacity-60">{t('searchEmpty')}</p>}

        {sectionHits.length > 0 && (
          <>
            <p className="pb-1 pt-3 text-xs font-semibold uppercase tracking-wide opacity-50">{t('searchSections')}</p>
            <ul>
              {sectionHits.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onPick({ catId: s.catId, elementId: anchor(s.id), kind: 'section' })}
                    className={`flex w-full items-center gap-2 py-2.5 text-left ${s.parent && !q ? 'pl-5' : ''}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate ${s.parent ? 'text-sm' : 'font-semibold'}`}>{s.name}</span>
                      {s.parent && q && <span className="block truncate text-xs opacity-50">{s.parent}</span>}
                    </span>
                    <span className="shrink-0 text-xs opacity-40">{s.count}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 opacity-30" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {productHits.length > 0 && (
          <>
            <p className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide opacity-50">{t('searchProducts')}</p>
            <ul>
              {productHits.map(({ product: p, catId, path }) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onPick({ catId, elementId: `prod-${p.id}`, kind: 'product' })}
                    className={`flex w-full items-center gap-3 py-2.5 text-left ${p.is_available ? '' : 'opacity-50'}`}
                  >
                    {p.image_url && (
                      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg">
                        <Image src={p.image_url} alt="" fill sizes="44px" className="object-cover" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.name}</span>
                      <span className="block truncate text-xs opacity-50">{path}</span>
                    </span>
                    {showPrices && p.show_price && p.price != null && (
                      <span className="shrink-0 text-sm font-medium" style={{ color: 'var(--brand-primary)' }}>
                        {formatPrice(p.price, currency, locale)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
