'use client';

import { useCallback, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { Product } from '@/lib/database.types';
import { BADGES, badgeLabel } from '@/lib/badges';
import { resolveOptionGroups } from '@/lib/menu-options';
import { Input, Textarea, Label, Button } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import { Drawer } from './Drawer';
import { OptionGroupsEditor } from './OptionGroupsEditor';
import { RecipeEditor } from './RecipeEditor';
import { updateProduct, deleteProduct } from '@/app/(dashboard)/menu/actions';

export function ProductDrawer({
  tenantId,
  product,
  onClose,
}: {
  tenantId: string;
  product: Product;
  onClose: () => void;
}) {
  const t = useTranslations('menuEditor');
  const tc = useTranslations('common');
  const locale = useLocale();
  const [tags, setTags] = useState<string[]>(product.tags ?? []);

  // Every field saves when it loses focus. The one edit that can be lost is
  // the field being typed in when the drawer is closed from the overlay, the
  // X or Escape: `dirty` is set by typing and cleared by the blur that saves,
  // so closing with a dirty field inside asks first.
  const body = useRef<HTMLDivElement>(null);
  const dirty = useRef(false);
  const [askUnsaved, setAskUnsaved] = useState(false);
  const requestClose = useCallback(() => {
    const active = document.activeElement as HTMLElement | null;
    if (dirty.current && active && body.current?.contains(active)) {
      setAskUnsaved(true);
      return;
    }
    onClose();
  }, [onClose]);
  function saveAndClose() {
    (document.activeElement as HTMLElement | null)?.blur(); // the blur handler saves
    dirty.current = false;
    setAskUnsaved(false);
    onClose();
  }
  function discardAndClose() {
    // Unmounting without a blur: the pending edit is never sent.
    dirty.current = false;
    setAskUnsaved(false);
    onClose();
  }

  function toggleTag(key: string) {
    const next = tags.includes(key) ? tags.filter((x) => x !== key) : [...tags, key];
    setTags(next);
    updateProduct(product.id, { tags: next });
  }

  return (
    <Drawer
      title={product.name || t('addProduct')}
      onClose={requestClose}
      footer={
        <button
          onClick={() => {
            deleteProduct(product.id);
            onClose();
          }}
          className="flex items-center gap-1 text-sm text-neutral-400 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" /> {tc('delete')}
        </button>
      }
    >
      <div
        ref={body}
        className="space-y-4"
        onInput={() => {
          dirty.current = true;
        }}
        onBlur={() => {
          dirty.current = false;
        }}
      >
        {askUnsaved && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setAskUnsaved(false)}>
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <p className="font-semibold">{t('unsavedTitle')}</p>
              <p className="mt-1 text-sm text-neutral-600">{t('unsavedBody')}</p>
              <div className="mt-4 flex flex-col gap-2">
                <Button onClick={saveAndClose}>{t('saveClose')}</Button>
                {/* Pressing this must not move focus: the blur would save the very edit being discarded. */}
                <Button variant="secondary" onPointerDown={(e) => e.preventDefault()} onClick={discardAndClose}>
                  {t('discard')}
                </Button>
                <button onClick={() => setAskUnsaved(false)} className="py-1 text-sm text-neutral-500 hover:text-neutral-900">
                  {t('keepEditing')}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-4">
          <Toggle
            label={t('available')}
            checked={product.is_available}
            onChange={(v) => updateProduct(product.id, { is_available: v })}
          />
          <Toggle
            label={t('showPrice')}
            checked={product.show_price}
            onChange={(v) => updateProduct(product.id, { show_price: v })}
          />
          <Toggle
            label={t('hidden')}
            checked={product.is_hidden}
            onChange={(v) => updateProduct(product.id, { is_hidden: v })}
          />
        </div>

        <div>
          <Label>{t('productName')}</Label>
          <Input defaultValue={product.name} onBlur={(e) => updateProduct(product.id, { name: e.target.value })} />
        </div>

        <div>
          <Label>{t('description')}</Label>
          <Textarea
            rows={2}
            defaultValue={product.description ?? ''}
            onBlur={(e) => updateProduct(product.id, { description: e.target.value || null })}
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
                updateProduct(product.id, { price: e.target.value === '' ? null : Number(e.target.value) })
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
          <div className="flex-1">
            <Label>{t('cost')}</Label>
            <Input
              type="number"
              step="0.01"
              inputMode="decimal"
              placeholder={t('costHint')}
              defaultValue={product.cost ?? ''}
              onBlur={(e) =>
                updateProduct(product.id, { cost: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </div>
        </div>

        {/* Ingredients per unit sold; stock comes off when the sale closes (0077). */}
        <RecipeEditor productId={product.id} productName={product.name} currency="MXN" />

        <div>
          <Label>{t('sku')}</Label>
          <Input
            defaultValue={product.sku ?? ''}
            placeholder={t('skuHint')}
            onBlur={(e) => updateProduct(product.id, { sku: e.target.value.trim() || null })}
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <Label>{t('prepTime')}</Label>
            <Input
              defaultValue={product.prep_time ?? ''}
              placeholder={t('prepTimeHint')}
              onBlur={(e) => updateProduct(product.id, { prep_time: e.target.value || null })}
            />
          </div>
          <div className="flex-1">
            <Label>{t('calories')}</Label>
            <Input
              type="number"
              inputMode="numeric"
              defaultValue={product.calories ?? ''}
              onBlur={(e) =>
                updateProduct(product.id, { calories: e.target.value === '' ? null : Number(e.target.value) })
              }
            />
          </div>
        </div>

        <div>
          <Label>{t('image')}</Label>
          <ImageUploader
            value={product.image_url}
            tenantId={tenantId}
            folder="products"
            onChange={(url) => updateProduct(product.id, { image_url: url })}
          />
        </div>

        <div>
          <Label>{t('badges')}</Label>
          <div className="flex flex-wrap gap-1.5">
            {BADGES.map((b) => {
              const on = tags.includes(b.key);
              return (
                <button
                  key={b.key}
                  onClick={() => toggleTag(b.key)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${on ? 'ring-2 ring-neutral-900' : 'opacity-70'}`}
                  style={{ backgroundColor: b.color, color: b.text }}
                >
                  {b.emoji} {badgeLabel(b, locale)}
                </button>
              );
            })}
          </div>
        </div>

        <OptionGroupsEditor
          value={resolveOptionGroups(product)}
          onSave={(groups) =>
            updateProduct(product.id, { option_groups: groups, variants: [], modifiers: [], removables: [] })
          }
        />

        <Button variant="secondary" className="w-full" onClick={onClose}>
          {tc('save')}
        </Button>
      </div>
    </Drawer>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-neutral-300" />
      {label}
    </label>
  );
}
