'use client';

import { useState } from 'react';
import Image from 'next/image';
import { X, Plus, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Product } from '@/lib/database.types';
import type { CartLine } from '@/lib/whatsapp';
import { resolveOptionGroups, type SelectedOption } from '@/lib/menu-options';
import { formatPrice } from '@/lib/utils';

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
  const groups = resolveOptionGroups(product);
  // group id -> selected option indices (single-choice groups hold 0 or 1)
  const [sel, setSel] = useState<Record<string, number[]>>(() => {
    const init: Record<string, number[]> = {};
    for (const g of groups) init[g.id] = !g.multiple && g.required && g.options.length > 0 ? [0] : [];
    return init;
  });
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  function toggle(groupId: string, idx: number, multiple: boolean) {
    setSel((cur) => {
      const chosen = cur[groupId] ?? [];
      if (multiple) {
        return { ...cur, [groupId]: chosen.includes(idx) ? chosen.filter((i) => i !== idx) : [...chosen, idx] };
      }
      return { ...cur, [groupId]: chosen[0] === idx ? [] : [idx] };
    });
  }

  const selections: SelectedOption[] = groups.flatMap((g) =>
    (sel[g.id] ?? []).map((i) => ({ group: g.name, name: g.options[i].name, price: g.options[i].price || 0 })),
  );
  const unit = (product.price ?? 0) + selections.reduce((s, o) => s + o.price, 0);
  const valid = groups.every((g) => !g.required || (sel[g.id]?.length ?? 0) > 0);

  function confirm() {
    if (!valid) return;
    const sig = selections.map((s) => `${s.group}:${s.name}`).sort().join(',');
    onConfirm({
      key: `${product.id}|${sig}`,
      productId: product.id,
      name: product.name,
      basePrice: product.price,
      selections,
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
            {product.description && <p className="mt-1 text-sm text-neutral-500">{product.description}</p>}

            {groups.map((g) => {
              const chosen = sel[g.id] ?? [];
              return (
                <div key={g.id} className="mt-5">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="text-sm font-semibold">{g.name}</h3>
                    {g.required && (
                      <span className="rounded-full bg-neutral-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {t('required')}
                      </span>
                    )}
                    {!g.required && <span className="text-xs text-neutral-400">{t('optional')}</span>}
                  </div>
                  {g.description && <p className="-mt-1 mb-2 text-xs text-neutral-400">{g.description}</p>}
                  <div className="space-y-2">
                    {g.options.map((o, i) => (
                      <label
                        key={i}
                        className="flex cursor-pointer items-center justify-between rounded-xl border border-neutral-200 px-3 py-2.5"
                      >
                        <span className="flex items-center gap-2 text-sm">
                          <input
                            type={g.multiple ? 'checkbox' : 'radio'}
                            name={g.id}
                            checked={chosen.includes(i)}
                            onChange={() => toggle(g.id, i, g.multiple)}
                          />
                          {o.name}
                        </span>
                        {showPrice && o.price > 0 && (
                          <span className="text-sm font-medium">+ {formatPrice(o.price, currency, locale)}</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}

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
            disabled={!valid}
            className="flex flex-1 items-center justify-center gap-2 rounded-full py-3 font-semibold disabled:opacity-40"
            style={{ backgroundColor: 'var(--brand-button)', color: 'var(--brand-button-text)' }}
          >
            {valid ? t('addToOrder') : t('chooseRequired')}
            {valid && showPrice && unit > 0 && <span>· {formatPrice(unit * qty, currency, locale)}</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
