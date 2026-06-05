'use client';

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, ChevronDown, Trash2, Plus, X } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { Product, PricedOption } from '@/lib/database.types';
import { BADGES, badgeLabel } from '@/lib/badges';
import { Input, Textarea, Label } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import { updateProduct, deleteProduct } from '@/app/(dashboard)/menu/actions';

export function ProductEditor({
  tenantId,
  product,
}: {
  tenantId: string;
  product: Product;
}) {
  const t = useTranslations('menuEditor');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [tags, setTags] = useState<string[]>(product.tags ?? []);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: product.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  function toggleTag(key: string) {
    const next = tags.includes(key) ? tags.filter((x) => x !== key) : [...tags, key];
    setTags(next);
    updateProduct(product.id, { tags: next });
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-neutral-200 bg-white">
      <div className="flex items-center gap-2 p-2.5">
        <button {...attributes} {...listeners} className="cursor-grab touch-none text-neutral-300">
          <GripVertical className="h-4 w-4" />
        </button>
        <span className="flex-1 truncate text-sm font-medium">{product.name}</span>
        {product.price != null && (
          <span className="text-sm text-neutral-500">{product.price}</span>
        )}
        <button onClick={() => setOpen((o) => !o)} className="p-1 text-neutral-400">
          <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-neutral-100 p-3">
          <div>
            <Label>{t('productName')}</Label>
            <Input
              defaultValue={product.name}
              onBlur={(e) => updateProduct(product.id, { name: e.target.value })}
            />
          </div>

          <div>
            <Label>{t('description')}</Label>
            <Textarea
              rows={2}
              defaultValue={product.description ?? ''}
              onBlur={(e) =>
                updateProduct(product.id, { description: e.target.value || null })
              }
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label>{t('price')}</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                defaultValue={product.price ?? ''}
                onBlur={(e) =>
                  updateProduct(product.id, {
                    price: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </div>
            <div className="flex-1">
              <Label>{t('compareAtPrice')}</Label>
              <Input
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder={t('compareAtHint')}
                defaultValue={product.compare_at_price ?? ''}
                onBlur={(e) =>
                  updateProduct(product.id, {
                    compare_at_price: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <Label>{t('prepTime')}</Label>
              <Input
                defaultValue={product.prep_time ?? ''}
                placeholder={t('prepTimeHint')}
                onBlur={(e) =>
                  updateProduct(product.id, { prep_time: e.target.value || null })
                }
              />
            </div>
            <div className="flex-1">
              <Label>{t('calories')}</Label>
              <Input
                type="number"
                inputMode="numeric"
                defaultValue={product.calories ?? ''}
                onBlur={(e) =>
                  updateProduct(product.id, {
                    calories: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              />
            </div>
          </div>

          {/* Badges */}
          <div>
            <Label>{t('badges')}</Label>
            <div className="flex flex-wrap gap-1.5">
              {BADGES.map((b) => {
                const on = tags.includes(b.key);
                return (
                  <button
                    key={b.key}
                    onClick={() => toggleTag(b.key)}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                      on ? 'ring-2 ring-neutral-900' : 'opacity-70'
                    }`}
                    style={{ backgroundColor: b.color, color: b.text }}
                  >
                    {b.emoji} {badgeLabel(b, locale)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Variants */}
          <OptionList
            label={t('variants')}
            hint={t('variantsHint')}
            value={product.variants ?? []}
            onChange={(v) => updateProduct(product.id, { variants: v })}
            namePlaceholder={t('variantName')}
          />

          {/* Modifiers / extras */}
          <OptionList
            label={t('modifiers')}
            hint={t('modifiersHint')}
            value={product.modifiers ?? []}
            onChange={(v) => updateProduct(product.id, { modifiers: v })}
            namePlaceholder={t('modifierName')}
          />

          <div>
            <Label>{t('image')}</Label>
            <ImageUploader
              value={product.image_url}
              tenantId={tenantId}
              folder="products"
              onChange={(url) => updateProduct(product.id, { image_url: url })}
            />
          </div>

          <div className="flex flex-wrap gap-4 pt-1">
            <Toggle
              label={t('showPrice')}
              checked={product.show_price}
              onChange={(v) => updateProduct(product.id, { show_price: v })}
            />
            <Toggle
              label={t('available')}
              checked={product.is_available}
              onChange={(v) => updateProduct(product.id, { is_available: v })}
            />
            <button
              onClick={() => deleteProduct(product.id)}
              className="ml-auto flex items-center gap-1 text-sm text-neutral-400 hover:text-red-500"
            >
              <Trash2 className="h-4 w-4" /> {tc('delete')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Editable list of {name, price} rows for variants or modifiers. */
function OptionList({
  label,
  hint,
  value,
  onChange,
  namePlaceholder,
}: {
  label: string;
  hint: string;
  value: PricedOption[];
  onChange: (v: PricedOption[]) => void;
  namePlaceholder: string;
}) {
  const [rows, setRows] = useState<PricedOption[]>(value);

  function commit(next: PricedOption[]) {
    setRows(next);
    onChange(next.filter((r) => r.name.trim() !== ''));
  }

  return (
    <div>
      <Label>{label}</Label>
      <p className="-mt-1 mb-1.5 text-xs text-neutral-400">{hint}</p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={row.name}
              placeholder={namePlaceholder}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], name: e.target.value };
                setRows(next);
              }}
              onBlur={() => commit(rows)}
              className="flex-1"
            />
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={row.price === 0 ? '' : row.price}
              placeholder="$"
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], price: Number(e.target.value) || 0 };
                setRows(next);
              }}
              onBlur={() => commit(rows)}
              className="w-24"
            />
            <button
              onClick={() => commit(rows.filter((_, j) => j !== i))}
              className="p-1 text-neutral-400 hover:text-red-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          onClick={() => setRows([...rows, { name: '', price: 0 }])}
          className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <Plus className="h-4 w-4" /> {label}
        </button>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-neutral-300"
      />
      {label}
    </label>
  );
}
