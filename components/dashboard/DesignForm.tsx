'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TenantTheme } from '@/lib/database.types';
import { MENU_FONTS } from '@/lib/config';
import {
  resolveMenuSettings,
  type MenuSettings,
} from '@/lib/menu-settings';
import { Card, Label, Input } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import {
  updateTheme,
  updateMenuSettings,
} from '@/app/(dashboard)/settings-actions';

export function DesignForm({ theme }: { theme: TenantTheme }) {
  const t = useTranslations('design');
  const [local, setLocal] = useState(theme);
  const [settings, setSettings] = useState<MenuSettings>(
    resolveMenuSettings(theme.settings),
  );

  function set<K extends keyof TenantTheme>(key: K, value: TenantTheme[K]) {
    setLocal((s) => ({ ...s, [key]: value }));
    updateTheme({ [key]: value } as Partial<TenantTheme>);
  }

  function setS<K extends keyof MenuSettings>(key: K, value: MenuSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    updateMenuSettings({ [key]: value });
  }

  const colorFields = [
    { key: 'primary_color', label: t('primary') },
    { key: 'secondary_color', label: t('secondary') },
    { key: 'background_color', label: t('background') },
    { key: 'text_color', label: t('text') },
  ] as const;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {/* Brand identity */}
        <Card>
          <h2 className="mb-4 font-semibold">{t('brand')}</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('logo')}</Label>
              <ImageUploader
                value={local.logo_url}
                tenantId={theme.tenant_id}
                folder="logos"
                shape="circle"
                onChange={(url) => set('logo_url', url)}
              />
            </div>
            <div>
              <Label>{t('cover')}</Label>
              <ImageUploader
                value={local.cover_image_url}
                tenantId={theme.tenant_id}
                folder="covers"
                shape="wide"
                onChange={(url) => set('cover_image_url', url)}
              />
            </div>
          </div>
          <div className="mt-4">
            <Label>{t('slogan')}</Label>
            <Input
              defaultValue={local.slogan ?? ''}
              placeholder={t('sloganPlaceholder')}
              onBlur={(e) => set('slogan', e.target.value || null)}
            />
          </div>
          <div className="mt-4">
            <ToggleRow
              label={t('showName')}
              checked={settings.showName}
              onChange={(v) => setS('showName', v)}
            />
          </div>
        </Card>

        {/* Colors */}
        <Card>
          <h2 className="mb-4 font-semibold">{t('colors')}</h2>
          <div className="grid grid-cols-2 gap-4">
            {colorFields.map(({ key, label }) => (
              <div key={key}>
                <Label>{label}</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={local[key]}
                    onChange={(e) => set(key, e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-neutral-200"
                  />
                  <span className="text-sm text-neutral-500">{local[key]}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <SelectRow
              label={t('darkMode')}
              value={settings.darkMode}
              onChange={(v) => setS('darkMode', v as MenuSettings['darkMode'])}
              options={[
                ['off', t('darkOff')],
                ['on', t('darkOn')],
                ['auto', t('darkAuto')],
              ]}
            />
          </div>
        </Card>

        {/* Typography */}
        <Card>
          <Label>{t('font')}</Label>
          <select
            value={local.font_family}
            onChange={(e) => set('font_family', e.target.value)}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2.5 text-sm"
          >
            {MENU_FONTS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </Card>

        {/* Layout & cards */}
        <Card className="space-y-4">
          <h2 className="font-semibold">{t('layout')}</h2>
          <SelectRow
            label={t('cardStyle')}
            value={settings.cardStyle}
            onChange={(v) => setS('cardStyle', v as MenuSettings['cardStyle'])}
            options={[
              ['list', t('cardList')],
              ['grid', t('cardGrid')],
              ['large', t('cardLarge')],
              ['text', t('cardText')],
            ]}
          />
          <SelectRow
            label={t('imageShape')}
            value={settings.imageShape}
            onChange={(v) => setS('imageShape', v as MenuSettings['imageShape'])}
            options={[
              ['rounded', t('shapeRounded')],
              ['square', t('shapeSquare')],
              ['circle', t('shapeCircle')],
              ['full', t('shapeFull')],
            ]}
          />
          <SelectRow
            label={t('cornerRadius')}
            value={settings.cornerRadius}
            onChange={(v) => setS('cornerRadius', v as MenuSettings['cornerRadius'])}
            options={[
              ['none', t('radNone')],
              ['sm', t('radSm')],
              ['md', t('radMd')],
              ['lg', t('radLg')],
              ['xl', t('radXl')],
            ]}
          />
          <SelectRow
            label={t('density')}
            value={settings.density}
            onChange={(v) => setS('density', v as MenuSettings['density'])}
            options={[
              ['comfortable', t('densityComfort')],
              ['compact', t('densityCompact')],
            ]}
          />
          <ToggleRow label={t('cardBorder')} checked={settings.cardBorder} onChange={(v) => setS('cardBorder', v)} />
          <ToggleRow label={t('cardShadow')} checked={settings.cardShadow} onChange={(v) => setS('cardShadow', v)} />
          <ToggleRow label={t('animations')} checked={settings.animations} onChange={(v) => setS('animations', v)} />
        </Card>

        {/* Navigation & discovery */}
        <Card className="space-y-4">
          <h2 className="font-semibold">{t('navigation')}</h2>
          <SelectRow
            label={t('navMode')}
            value={settings.navMode}
            onChange={(v) => setS('navMode', v as MenuSettings['navMode'])}
            options={[
              ['scroll', t('navScroll')],
              ['tabs', t('navTabs')],
            ]}
          />
          <ToggleRow label={t('stickyTabs')} checked={settings.stickyTabs} onChange={(v) => setS('stickyTabs', v)} />
          <ToggleRow label={t('collapsible')} checked={settings.collapsibleCategories} onChange={(v) => setS('collapsibleCategories', v)} />
          <ToggleRow label={t('showSearch')} checked={settings.showSearch} onChange={(v) => setS('showSearch', v)} />
          <ToggleRow label={t('showFilters')} checked={settings.showFilters} onChange={(v) => setS('showFilters', v)} />
          <ToggleRow label={t('showSocial')} checked={settings.showSocial} onChange={(v) => setS('showSocial', v)} />
          <SelectRow
            label={t('soldOut')}
            value={settings.soldOutStyle}
            onChange={(v) => setS('soldOutStyle', v as MenuSettings['soldOutStyle'])}
            options={[
              ['gray', t('soldOutGray')],
              ['hide', t('soldOutHide')],
            ]}
          />
        </Card>

        {/* Prices & media */}
        <Card className="flex items-center justify-between">
          <span className="text-sm font-medium">{t('showPricesGlobal')}</span>
          <input
            type="checkbox"
            checked={local.show_prices}
            onChange={(e) => set('show_prices', e.target.checked)}
            className="h-5 w-5 rounded border-neutral-300"
          />
        </Card>

        <Card>
          <Label>{t('backgroundImage')}</Label>
          <ImageUploader
            value={local.background_image_url}
            tenantId={theme.tenant_id}
            folder="backgrounds"
            shape="wide"
            onChange={(url) => set('background_image_url', url)}
          />
        </Card>
      </div>

      {/* Live preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Label>{t('preview')}</Label>
        <div
          className="overflow-hidden rounded-2xl border border-neutral-200 p-5"
          style={{
            backgroundColor: settings.darkMode === 'on' ? '#111114' : local.background_color,
            color: settings.darkMode === 'on' ? '#f5f5f5' : local.text_color,
            fontFamily: `'${local.font_family}', sans-serif`,
            backgroundImage: local.background_image_url
              ? `url(${local.background_image_url})`
              : undefined,
            backgroundSize: 'cover',
          }}
        >
          <p className="text-lg font-bold">{local.slogan || 'Tu Restaurante'}</p>
          <div
            className="mt-3 p-3"
            style={{
              backgroundColor: settings.darkMode === 'on' ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.85)',
              borderRadius: 16,
              border: settings.cardBorder ? '1px solid rgba(0,0,0,.1)' : undefined,
              boxShadow: settings.cardShadow ? '0 1px 4px rgba(0,0,0,.1)' : undefined,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">Producto ejemplo</span>
              <span style={{ color: local.primary_color }} className="font-semibold">
                $120
              </span>
            </div>
            <p className="mt-1 text-sm opacity-70">Descripción del platillo.</p>
            <button
              className="mt-3 rounded-full px-4 py-1.5 text-sm font-semibold text-white"
              style={{ backgroundColor: local.primary_color }}
            >
              Agregar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3">
      <span className="text-sm font-medium">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 rounded border-neutral-300"
      />
    </label>
  );
}
