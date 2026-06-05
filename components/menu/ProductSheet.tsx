'use client';

import { useState } from 'react';
import Image from 'next/image';
import { X, Plus, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Product, PricedOption } from '@/lib/database.types';
import type { CartLine } from '@/lib/whatsapp';
import { formatPrice } from '@/lib/utils';

/** Build a stable cart key for a product + chosen variant + extras. */
export function cartKey(productId: string, variant: string | null, extras: PricedOption[]): string {
  const ex = extras.map((e) => e.name).sort().join(',');
  return `${productId}|${variant ?? ''}|${ex}`;
}

export function ProductSheet({
  product,
  showPrice,
  currency,
  locale,
  onClose,
  onConfirm,
}: {
  product: Product;
  showPrice: boolean;
  currency: string;
  locale: string;
  onClose: () => void;
  onConfirm: (line: CartLine) => void;
}) {
  const t = useTranslations('menu');
  const [variantIdx, setVariantIdx] = useState<number>(product.variants.length > 0 ? 0 : -1);
  const [extras, setExtras] = useState<Record<string, PricedOption>>({});
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  const variant = variantIdx >= 0 ? product.variants[variantIdx] : null;
  const basePrice = variant ? variant.price : product.price;
  const chosenExtras = Object.values(extras);
  const unit = (basePrice ?? 0) + chosenExtras.reduce((s, e) => s + e.price, 0);

  function toggleExtra(e: PricedOption) {
    setExtras((cur) => {
      const next = { ...cur };
      if (next[e.name]) delete next[e.name];
      else next[e.name] = e;
      return next;
    });
  }

  function confirm() {
    onConfirm({
      key: cartKey(product.id, variant?.name ?? null, chosenExtras),
      productId: product.id,
      name: product.name,
      basePrice,
      variantName: variant?.name,
      extras: chosenExtras,
      qty,
      note: note.trim() || undefined,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="relative flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-3xl bg-white text-neutral-900 sm:rounded-3xl">
        <button
          onClick={onClose}
          aria-label="close"
          className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-1.5 text-neutral-600 shadow"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex-1 overflow-y-auto">
          {product.image_url && (
            <div className="relative aspect-video w-full overflow-hidden rounded-t-3xl">
              <Image src={product.image_url} alt={product.name} fill className="object-cover" />
            </div>
          )}

          <div className="px-5 py-4">
            <h2 className="text-xl font-bold">{product.name}</h2>
            {product.description && (
              <p className="mt-1 text-sm text-neutral-500">{product.description}</p>
            )}

            {/* Variants (single choice) */}
            {product.variants.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">{t('chooseOption')}</h3>
                <div className="space-y-2">
                  {product.variants.map((v, i) => (
                    <label
                      key={i}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="variant"
                          checked={variantIdx === i}
                          onChange={() => setVariantIdx(i)}
                        />
                        {v.name}
                      </span>
                      {showPrice && (
                        <span className="text-sm font-medium">
                          {formatPrice(v.price, currency, locale)}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Modifiers / extras (multi choice) */}
            {product.modifiers.length > 0 && (
              <div className="mt-5">
                <h3 className="mb-2 text-sm font-semibold">{t('addExtras')}</h3>
                <div className="space-y-2">
                  {product.modifiers.map((m, i) => (
                    <label
                      key={i}
                      className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(extras[m.name])}
                          onChange={() => toggleExtra(m)}
                        />
                        {m.name}
                      </span>
                      {showPrice && (
                        <span className="text-sm font-medium">
                          + {formatPrice(m.price, currency, locale)}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Note */}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('notePlaceholder')}
              className="mt-5 w-full rounded-lg border border-neutral-200 px-3 py-2.5 text-sm focus:border-neutral-400 focus:outline-none"
            />
          </div>
        </div>

        {/* Footer: qty + add */}
        <div className="flex items-center gap-3 border-t border-neutral-100 px-5 py-4">
          <div className="flex items-center gap-3 rounded-full bg-neutral-100 px-2 py-1">
            <button onClick={() => setQty((q) => Math.max(1, q - 1))} aria-label="−" className="p-1">
              <Minus className="h-4 w-4" />
            </button>
            <span className="min-w-5 text-center text-sm font-semibold">{qty}</span>
            <button onClick={() => setQty((q) => q + 1)} aria-label="+" className="p-1">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={confirm}
            className="flex flex-1 items-center justify-center gap-2 rounded-full py-3 font-semibold text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            {t('addToOrder')}
            {showPrice && unit > 0 && <span>· {formatPrice(unit * qty, currency, locale)}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
