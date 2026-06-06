'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { Product } from '@/lib/database.types';
import { BADGES, badgeLabel } from '@/lib/badges';
import { resolveOptionGroups } from '@/lib/menu-options';
import { Input, Textarea, Label, Button } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import { Drawer } from './Drawer';
import { OptionGroupsEditor } from './OptionGroupsEditor';
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

  function toggleTag(key: string) {
    const next = tags.includes(key) ? tags.filter((x) => x !== key) : [...tags, key];
    setTags(next);
    updateProduct(product.id, { tags: next });
  }

  return (
    <Drawer
      title={product.name || t('addProduct')}
      onClose={onClose}
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
      <div className="space-y-4">
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
