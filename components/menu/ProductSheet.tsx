'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { X, Plus, Minus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Product } from '@/lib/database.types';
import type { CartLine } from '@/lib/whatsapp';
import { resolveOptionGroups, optionKind, type SelectedOption } from '@/lib/menu-options';
import { formatPrice } from '@/lib/utils';

export function ProductSheet({
  product,
  themeStyle,
  showPrice,
  currency,
  locale,
  onClose,
  onConfirm,
  initial,
  readOnly = false,
  notePlaceholder,
  showOptionKind = true,
}: {
  product: Product;
  /** The product's section design (CSS variables), so the sheet matches its card. */
  themeStyle?: React.CSSProperties;
  showPrice: boolean;
  currency: string;
  locale: string;
  onClose: () => void;
  onConfirm: (line: CartLine) => void;
  // When set, the sheet opens pre-filled to edit an existing line.
  initial?: { qty: number; note: string | null; selections: SelectedOption[] };
  /**
   * Showcase mode: the guest cannot order, so the sheet is a read-only detail
   * card. The options still show — otherwise "choose your protein" would be
   * invisible on a look-only menu.
   */
  readOnly?: boolean;
  /** The restaurant's own hint for the notes box; falls back to the built-in one. */
  notePlaceholder?: string | null;
  /** Whether to print the "dish / drink / to go" tag next to each option group. */
  showOptionKind?: boolean;
}) {
  const t = useTranslations('menu');
  const groups = resolveOptionGroups(product);
  // group id -> selected option indices (single-choice groups hold 0 or 1)
  const [sel, setSel] = useState<Record<string, number[]>>(() => {
    const init: Record<string, number[]> = {};
    for (const g of groups) {
      if (initial) {
        // Pre-select by matching the saved option names within each group.
        const picked = initial.selections.filter((s) => s.group === g.name).map((s) => s.name);
        init[g.id] = g.options.map((o, i) => (picked.includes(o.name) ? i : -1)).filter((i) => i >= 0);
      } else {
        init[g.id] = !g.multiple && g.required && g.options.length > 0 ? [0] : [];
      }
    }
    return init;
  });
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const [note, setNote] = useState(initial?.note ?? '');

  // Lock background scroll so the mobile URL bar can't toggle and shift the
  // sheet while scrolling its content.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" style={themeStyle}>
      <div className="animate-fade absolute inset-0 bg-black/50" onClick={onClose} />

      <div className="animate-slide-up relative flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--sheet-radius)] sm:rounded-[var(--sheet-radius)]"
        style={{ backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text)', fontFamily: 'var(--brand-font)' }}>
        <button
          onClick={onClose}
          aria-label="close"
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 shadow"
          style={{ backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text-secondary)' }}
        >
          <X className="h-5 w-5" />
        </button>

        <div className="flex-1 overflow-y-auto">
          {product.image_url && (
            <div
              className="flex w-full justify-center overflow-hidden rounded-t-[var(--sheet-radius)] p-4"
              style={{ backgroundColor: 'var(--brand-bg)' }}
            >
              {/* The whole photo, uncropped: a tall cup or a wide platter both fit. */}
              <Image
                src={product.image_url}
                alt={product.name}
                width={1200}
                height={1200}
                sizes="(max-width: 640px) 100vw, 512px"
                className="h-auto max-h-[50dvh] w-auto max-w-full object-contain"
              />
            </div>
          )}

          <div className="px-5 py-4">
            <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-product)' }}>{product.name}</h2>
            {readOnly && showPrice && product.price != null && (
              <p className="mt-1 text-lg font-semibold" style={{ color: 'var(--brand-primary)', fontFamily: 'var(--font-price)' }}>
                {formatPrice(product.price, currency, locale)}
              </p>
            )}
            {product.description && (
              <p
                className="mt-1 whitespace-pre-line text-sm"
                style={{ color: 'var(--brand-text-secondary)', fontFamily: 'var(--font-description)' }}
              >
                {product.description}
              </p>
            )}

            {groups.map((g) => {
              const chosen = sel[g.id] ?? [];
              return (
                <div key={g.id} className="mt-5">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-semibold">{g.name}</h3>
                    {showOptionKind !== false && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          optionKind(g) === 'takeaway'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-[var(--tab-unselected-bg)] text-[var(--brand-text-secondary)]'
                        }`}
                      >
                        {t(
                          optionKind(g) === 'takeaway'
                            ? 'optionsTakeaway'
                            : optionKind(g) === 'drink'
                              ? 'optionsDrink'
                              : 'optionsDish',
                        )}
                      </span>
                    )}
                    {!readOnly && g.required && (
                      <span className="rounded-full bg-[var(--brand-button)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--brand-button-text)]">
                        {t('required')}
                      </span>
                    )}
                    {!readOnly && !g.required && (
                      <span className="text-xs text-[var(--brand-text-secondary)]">{t('optional')}</span>
                    )}
                  </div>
                  {g.description && <p className="-mt-1 mb-2 text-xs text-[var(--brand-text-secondary)]">{g.description}</p>}
                  <div className="space-y-2">
                    {g.options.map((o, i) => (
                      <label
                        key={i}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition ${
                          chosen.includes(i)
                            ? 'border-[var(--brand-button)] bg-[var(--brand-button)] text-[var(--brand-button-text)]'
                            : 'border-[var(--brand-border)]'
                        } ${
                          readOnly ? '' : 'cursor-pointer'
                        }`}
                      >
                        <span className="flex items-center gap-2 text-sm">
                          {!readOnly && (
                            <input
                              type={g.multiple ? 'checkbox' : 'radio'}
                              name={g.id}
                              checked={chosen.includes(i)}
                              onChange={() => toggle(g.id, i, g.multiple)}
                            />
                          )}
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

            {!readOnly && (
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={notePlaceholder || t('notePlaceholder')}
                className="mt-5 w-full rounded-xl border border-[var(--brand-border)] bg-[var(--brand-surface)] px-3 py-2.5 text-sm focus:border-[var(--brand-primary)] focus:outline-none"
              />
            )}
          </div>
        </div>

        {/* Footer: qty + add (hidden in showcase mode) */}
        {!readOnly && (
        <div className="flex items-center gap-3 border-t border-[var(--brand-border)] px-5 py-4">
          <div className="flex items-center gap-3 rounded-full bg-[var(--tab-unselected-bg)] px-2 py-1">
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
        )}
      </div>
    </div>
  );
}
