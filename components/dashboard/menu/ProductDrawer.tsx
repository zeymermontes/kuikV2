'use client';

import { useState } from 'react';
import { Plus, X, Trash2, Copy, ClipboardPaste, Check } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { Product, PricedOption } from '@/lib/database.types';
import { BADGES, badgeLabel } from '@/lib/badges';
import { Input, Textarea, Label, Button } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import { Drawer } from './Drawer';
import { updateProduct, deleteProduct } from '@/app/(dashboard)/menu/actions';

// Browser-local clipboard so options can be copied between product drawers.
const OPTIONS_CLIPBOARD = 'kuik_options_clipboard';

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
  const [variants, setVariants] = useState<PricedOption[]>(product.variants ?? []);
  const [modifiers, setModifiers] = useState<PricedOption[]>(product.modifiers ?? []);
  const [removables, setRemovables] = useState<string[]>(product.removables ?? []);
  const [pasteKey, setPasteKey] = useState(0);
  const [copied, setCopied] = useState(false);

  function copyOptions() {
    localStorage.setItem(OPTIONS_CLIPBOARD, JSON.stringify({ variants, modifiers, removables }));
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function pasteOptions() {
    const raw = localStorage.getItem(OPTIONS_CLIPBOARD);
    if (!raw) {
      alert(t('noClipboard'));
      return;
    }
    try {
      const c = JSON.parse(raw) as { variants?: PricedOption[]; modifiers?: PricedOption[]; removables?: string[] };
      const v = c.variants ?? [];
      const m = c.modifiers ?? [];
      const r = c.removables ?? [];
      setVariants(v);
      setModifiers(m);
      setRemovables(r);
      updateProduct(product.id, { variants: v, modifiers: m, removables: r });
      setPasteKey((k) => k + 1);
    } catch {
      alert(t('noClipboard'));
    }
  }

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

        <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
          <span className="text-sm font-semibold">{t('options')}</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={copyOptions}
              className="flex items-center gap-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t('copiedOptions') : t('copyOptions')}
            </button>
            <button
              type="button"
              onClick={pasteOptions}
              className="flex items-center gap-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50"
            >
              <ClipboardPaste className="h-3.5 w-3.5" /> {t('pasteOptions')}
            </button>
          </div>
        </div>

        <OptionList
          key={`variants-${pasteKey}`}
          label={t('variants')}
          hint={t('variantsHint')}
          value={variants}
          onChange={(v) => {
            setVariants(v);
            updateProduct(product.id, { variants: v });
          }}
          namePlaceholder={t('variantName')}
        />
        <OptionList
          key={`modifiers-${pasteKey}`}
          label={t('modifiers')}
          hint={t('modifiersHint')}
          value={modifiers}
          onChange={(v) => {
            setModifiers(v);
            updateProduct(product.id, { modifiers: v });
          }}
          namePlaceholder={t('modifierName')}
        />
        <StringList
          key={`removables-${pasteKey}`}
          label={t('removables')}
          hint={t('removablesHint')}
          value={removables}
          onChange={(v) => {
            setRemovables(v);
            updateProduct(product.id, { removables: v });
          }}
          placeholder={t('removableName')}
        />

        <Button variant="secondary" className="w-full" onClick={onClose}>
          {tc('save')}
        </Button>
      </div>
    </Drawer>
  );
}

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
            <button onClick={() => commit(rows.filter((_, j) => j !== i))} className="p-1 text-neutral-400 hover:text-red-500">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button onClick={() => setRows([...rows, { name: '', price: 0 }])} className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
          <Plus className="h-4 w-4" /> {label}
        </button>
      </div>
    </div>
  );
}

function StringList({
  label,
  hint,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  hint: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [rows, setRows] = useState<string[]>(value);
  function commit(next: string[]) {
    setRows(next);
    onChange(next.map((r) => r.trim()).filter(Boolean));
  }
  return (
    <div>
      <Label>{label}</Label>
      <p className="-mt-1 mb-1.5 text-xs text-neutral-400">{hint}</p>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={row}
              placeholder={placeholder}
              onChange={(e) => {
                const next = [...rows];
                next[i] = e.target.value;
                setRows(next);
              }}
              onBlur={() => commit(rows)}
              className="flex-1"
            />
            <button onClick={() => commit(rows.filter((_, j) => j !== i))} className="p-1 text-neutral-400 hover:text-red-500">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button onClick={() => setRows([...rows, ''])} className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900">
          <Plus className="h-4 w-4" /> {label}
        </button>
      </div>
    </div>
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
