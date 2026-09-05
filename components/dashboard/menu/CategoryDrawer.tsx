'use client';

import { Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Category, CategoryTheme } from '@/lib/database.types';
import { MENU_FONTS } from '@/lib/config';
import { CATEGORY_THEME_COLORS, CATEGORY_THEME_FONTS } from '@/lib/category-theme';
import { Input, Label, Button } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import { ColorWheel } from '@/components/dashboard/ColorWheel';
import { Drawer } from './Drawer';
import { updateCategory, deleteCategory, setCategoryParent } from '@/app/(dashboard)/menu/actions';

export function CategoryDrawer({
  tenantId,
  category,
  onClose,
  showPosSettings = false,
  parentOptions = [],
  hasSubcategories = false,
}: {
  tenantId: string;
  category: Category;
  onClose: () => void;
  /** KDS station routing is still in development — see lib/features.ts. */
  showPosSettings?: boolean;
  /** Top-level categories this one may be nested under. */
  parentOptions?: { id: string; name: string }[];
  /** A category that already has subcategories cannot itself become one. */
  hasSubcategories?: boolean;
}) {
  const t = useTranslations('menuEditor');
  const tc = useTranslations('common');

  // One key at a time; an empty theme is stored as null so "inherit" stays the default.
  function setTheme(key: keyof CategoryTheme, value: string | null) {
    const next: CategoryTheme = { ...(category.theme ?? {}) };
    if (value) next[key] = value;
    else delete next[key];
    updateCategory(category.id, { theme: Object.keys(next).length ? next : null });
  }

  return (
    <Drawer
      title={category.name}
      onClose={onClose}
      footer={
        <button
          onClick={() => {
            if (confirm('¿Eliminar categoría?')) {
              deleteCategory(category.id);
              onClose();
            }
          }}
          className="flex items-center gap-1 text-sm text-neutral-400 hover:text-red-500"
        >
          <Trash2 className="h-4 w-4" /> {tc('delete')}
        </button>
      }
    >
      <div className="space-y-5">
        <div>
          <Label>{t('categoryName')}</Label>
          <Input
            key={category.name}
            defaultValue={category.name}
            onBlur={(e) =>
              e.target.value !== category.name &&
              updateCategory(category.id, { name: e.target.value })
            }
          />
        </div>

        {/* KDS routing — in development, see lib/features.ts */}
        {showPosSettings && (
          <div>
            <Label>{t('station')}</Label>
            <Input
              defaultValue={category.station ?? ''}
              placeholder={t('stationHint')}
              onBlur={(e) => updateCategory(category.id, { station: e.target.value.trim() || null })}
            />
          </div>
        )}

        {/* Nesting: top level, or a subcategory of another section */}
        <div>
          <Label>{t('parentCategory')}</Label>
          <select
            value={category.parent_id ?? ''}
            disabled={hasSubcategories}
            onChange={(e) => setCategoryParent(category.id, e.target.value || null)}
            className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm disabled:bg-neutral-100 disabled:text-neutral-400"
          >
            <option value="">{t('parentNone')}</option>
            {parentOptions
              .filter((p) => p.id !== category.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
          <p className="mt-1 text-xs text-neutral-400">
            {hasSubcategories ? t('parentHasChildren') : t('parentHint')}
          </p>
        </div>

        {/* Tab icon / image */}
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="mb-2 text-xs font-medium text-neutral-500">{t('tabIcon')}</p>
          <div className="flex items-start gap-3">
            <div className="w-20">
              <Input
                defaultValue={category.icon ?? ''}
                placeholder="🌮"
                maxLength={4}
                onBlur={(e) => updateCategory(category.id, { icon: e.target.value || null })}
                className="text-center text-xl"
              />
              <p className="mt-1 text-center text-[10px] text-neutral-400">{t('emoji')}</p>
            </div>
            <div className="flex-1">
              <ImageUploader
                value={category.icon_image_url}
                tenantId={tenantId}
                folder="icons"
                shape="square"
                onChange={(url) => updateCategory(category.id, { icon_image_url: url })}
              />
              <p className="mt-1 text-[10px] text-neutral-400">{t('tabIconHint')}</p>
            </div>
          </div>
        </div>

        {/* Section design — its own colours and fonts; the page fades to them as
            the section scrolls into view. */}
        <div className="rounded-xl bg-neutral-50 p-3">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-neutral-500">{t('sectionDesign')}</p>
              <p className="text-[10px] text-neutral-400">{t('sectionDesignHint')}</p>
            </div>
            {category.theme && (
              <button
                type="button"
                onClick={() => updateCategory(category.id, { theme: null })}
                className="shrink-0 text-xs text-neutral-400 underline hover:text-neutral-700"
              >
                {t('clearDesign')}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORY_THEME_COLORS.map((key) => {
              const val = category.theme?.[key];
              return (
                <div key={key} className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2 py-1.5">
                  <ColorWheel
                    value={val}
                    fallback="#ffffff"
                    label={t(`th_${key}`)}
                    size="sm"
                    onChange={(hex) => setTheme(key, hex)}
                    onClear={() => setTheme(key, null)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11px] font-medium">{t(`th_${key}`)}</span>
                    <span className="block font-mono text-[10px] text-neutral-400">{val ?? t('th_inherit')}</span>
                  </span>
                  {val && (
                    <button
                      type="button"
                      onClick={() => setTheme(key, null)}
                      aria-label={t('clearColor')}
                      className="px-1 text-neutral-300 hover:text-neutral-600"
                    >
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {CATEGORY_THEME_FONTS.map((key) => (
              <div key={key}>
                <Label>{t(`th_${key}`)}</Label>
                <select
                  value={category.theme?.[key] ?? ''}
                  onChange={(e) => setTheme(key, e.target.value || null)}
                  className="w-full rounded-lg border border-neutral-300 px-2 py-2 text-sm"
                >
                  <option value="">{t('th_inherit')}</option>
                  {MENU_FONTS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Label>{t('sectionBackground')}</Label>
            <ImageUploader
              value={category.theme?.background_image ?? null}
              tenantId={tenantId}
              folder="backgrounds"
              shape="wide"
              onChange={(url) => setTheme('background_image', url)}
            />
            <p className="mt-1 text-[10px] text-neutral-400">{t('sectionBackgroundHint')}</p>
          </div>
        </div>

        {/* Section banner */}
        <div className="rounded-xl bg-neutral-50 p-3">
          <p className="mb-2 text-xs font-medium text-neutral-500">{t('banner')}</p>
          <Input
            defaultValue={category.banner_name ?? ''}
            placeholder={t('bannerName')}
            onBlur={(e) => updateCategory(category.id, { banner_name: e.target.value || null })}
            className="mb-3"
          />
          <ImageUploader
            value={category.banner_image_url}
            tenantId={tenantId}
            folder="banners"
            shape="wide"
            onChange={(url) => updateCategory(category.id, { banner_image_url: url })}
          />
        </div>

        <Button variant="secondary" className="w-full" onClick={onClose}>
          {tc('save')}
        </Button>
      </div>
    </Drawer>
  );
}
