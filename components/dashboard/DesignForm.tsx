'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { TenantTheme } from '@/lib/database.types';
import { MENU_FONTS, CUSTOM_FONT } from '@/lib/config';
import { BADGES } from '@/lib/badges';
import {
  resolveMenuSettings,
  type MenuSettings,
} from '@/lib/menu-settings';
import { Card, Label, Input } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import { FontPicker } from '@/components/dashboard/FontPicker';
import { CustomFontUploader } from '@/components/dashboard/CustomFontUploader';

// Accept 3/4/6/8-digit hex (the 4/8 forms carry alpha).
const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function normHex(v: string): string | null {
  let s = v.trim();
  if (s && !s.startsWith('#')) s = `#${s}`;
  return HEX.test(s) ? s : null;
}

/** Split a hex color into its solid #rrggbb part and an alpha 0–255. */
function parseColor(hex: string): { rgb: string; alpha: number } {
  const m = /^#([0-9a-fA-F]+)$/.exec((hex ?? '').trim());
  let h = m?.[1] ?? '';
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
  if (h.length === 6) return { rgb: `#${h}`, alpha: 255 };
  if (h.length === 8) return { rgb: `#${h.slice(0, 6)}`, alpha: parseInt(h.slice(6, 8), 16) };
  return { rgb: '#000000', alpha: 255 };
}

/** Combine #rrggbb + alpha into #rrggbb or #rrggbbaa. */
function toHex(rgb: string, alpha: number): string {
  if (alpha >= 255) return rgb;
  return `${rgb}${Math.round(alpha).toString(16).padStart(2, '0')}`;
}
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

  // Upload/remove the custom font. On upload it becomes the main font; on remove
  // any field still using it reverts to a default.
  function onCustomFont(url: string | null, fname: string | null) {
    let patch: Partial<TenantTheme>;
    if (url) {
      patch = { custom_font_url: url, custom_font_name: fname, font_family: CUSTOM_FONT };
    } else {
      const reset = (v: string | null) => (v === CUSTOM_FONT ? null : v);
      patch = {
        custom_font_url: null,
        custom_font_name: null,
        font_family: local.font_family === CUSTOM_FONT ? 'Inter' : local.font_family,
        font_category: reset(local.font_category),
        font_product: reset(local.font_product),
        font_price: reset(local.font_price),
        font_description: reset(local.font_description),
      };
    }
    setLocal((s) => ({ ...s, ...patch }));
    updateTheme(patch);
  }

  type ColorKey =
    | 'primary_color' | 'secondary_color' | 'background_color' | 'card_color'
    | 'border_color' | 'separator_color' | 'text_color' | 'text_secondary_color'
    | 'tab_bar_color' | 'tab_selected_color' | 'tab_unselected_color' | 'tab_font_color'
    | 'button_color' | 'button_text_color';

  const colorFields: { key: ColorKey; label: string; fallback?: string }[] = [
    { key: 'primary_color', label: t('primary') },
    { key: 'secondary_color', label: t('secondary') },
    { key: 'background_color', label: t('background') },
    { key: 'card_color', label: t('card') },
    { key: 'border_color', label: t('border') },
    { key: 'separator_color', label: t('separator') },
    { key: 'text_color', label: t('text') },
    { key: 'text_secondary_color', label: t('textSecondary') },
    { key: 'button_color', label: t('button'), fallback: local.primary_color },
    { key: 'button_text_color', label: t('buttonText'), fallback: '#ffffff' },
    { key: 'tab_bar_color', label: t('tabBar'), fallback: local.background_color },
    { key: 'tab_selected_color', label: t('tabSelected'), fallback: local.primary_color },
    { key: 'tab_unselected_color', label: t('tabUnselected'), fallback: '#eeeeee' },
    { key: 'tab_font_color', label: t('tabFont'), fallback: local.text_color },
  ];

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
            {colorFields.map(({ key, label, fallback }) => {
              const { rgb, alpha } = parseColor(local[key] ?? fallback ?? '#000000');
              const pct = Math.round((alpha / 255) * 100);
              return (
                <div key={key}>
                  <Label>{label}</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={rgb}
                      onChange={(e) => set(key, toHex(e.target.value, alpha))}
                      className="h-9 w-10 shrink-0 cursor-pointer rounded border border-neutral-200"
                    />
                    <input
                      type="text"
                      value={local[key] ?? ''}
                      maxLength={9}
                      spellCheck={false}
                      placeholder={fallback ?? '#000000'}
                      onChange={(e) => setLocal((s) => ({ ...s, [key]: e.target.value }))}
                      onBlur={(e) => {
                        const v = normHex(e.target.value);
                        if (v) set(key, v);
                        else setLocal((s) => ({ ...s, [key]: theme[key] }));
                      }}
                      className="w-full min-w-0 rounded-lg border border-neutral-300 px-2 py-1.5 font-mono text-xs uppercase outline-none focus:border-neutral-900"
                    />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={pct}
                      onChange={(e) => set(key, toHex(rgb, Math.round((Number(e.target.value) / 100) * 255)))}
                      className="h-1 flex-1 cursor-pointer accent-neutral-900"
                      title={t('opacity')}
                    />
                    <span className="w-8 text-right text-[10px] text-neutral-400">{pct}%</span>
                  </div>
                </div>
              );
            })}
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
          <FontPicker
            value={local.font_family}
            onChange={(f) => set('font_family', f)}
            customFontUrl={local.custom_font_url}
            customFontName={local.custom_font_name}
          />
          <div className="mt-4 border-t border-neutral-100 pt-4">
            <Label>{t('customFont')}</Label>
            <CustomFontUploader
              value={local.custom_font_url}
              name={local.custom_font_name}
              tenantId={theme.tenant_id}
              onChange={onCustomFont}
            />
          </div>

          {/* Per-element fonts */}
          <div className="mt-4 space-y-2 border-t border-neutral-100 pt-4">
            <p className="text-xs font-medium text-neutral-500">{t('perElementFonts')}</p>
            {(
              [
                { key: 'font_category', label: t('fontCategory') },
                { key: 'font_product', label: t('fontProduct') },
                { key: 'font_price', label: t('fontPrice') },
                { key: 'font_description', label: t('fontDescription') },
              ] as const
            ).map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between gap-3">
                <span className="text-sm">{label}</span>
                <select
                  value={local[key] ?? ''}
                  onChange={(e) => set(key, e.target.value || null)}
                  className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                  style={{ fontFamily: local[key] ? `'${local[key]}'` : undefined }}
                >
                  <option value="">{t('inheritFont')}</option>
                  {MENU_FONTS.map((f) => (
                    <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>
                      {f}
                    </option>
                  ))}
                  {local.custom_font_url && (
                    <option value={CUSTOM_FONT} style={{ fontFamily: `'${CUSTOM_FONT}'` }}>
                      {local.custom_font_name || t('customFont')}
                    </option>
                  )}
                </select>
              </div>
            ))}
          </div>
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
        <Preview local={local} settings={settings} />
      </div>
    </div>
  );
}

const BB = BADGES.find((b) => b.key === 'bestseller');
const BESTSELLER = BB ? { emoji: BB.emoji, label: BB.es, color: BB.color, text: BB.text } : undefined;

function Preview({ local, settings }: { local: TenantTheme; settings: MenuSettings }) {
  const dark = settings.darkMode === 'on';
  const bg = dark ? '#111114' : local.background_color;
  const text = dark ? '#f5f5f5' : local.text_color;
  const textSec = dark ? 'rgba(245,245,245,.6)' : local.text_secondary_color ?? '#737373';
  const card = dark ? 'rgba(255,255,255,.07)' : local.card_color ?? '#ffffff';
  const border = dark ? 'rgba(255,255,255,.12)' : local.border_color ?? '#e5e5e5';
  const sep = local.separator_color ?? '#e5e5e5';
  const radius = { none: 0, sm: 8, md: 12, lg: 16, xl: 24 }[settings.cornerRadius] ?? 16;

  const cardStyle: React.CSSProperties = {
    backgroundColor: card,
    borderRadius: radius,
    border: settings.cardBorder ? `1px solid ${border}` : undefined,
    boxShadow: settings.cardShadow ? '0 1px 6px rgba(0,0,0,.08)' : undefined,
  };
  // Same fallbacks the public menu uses, so the preview matches it exactly.
  const p = local.primary_color;
  const tabSelBg = local.tab_selected_color ?? p;
  const tabUnselBg = local.tab_unselected_color ?? `color-mix(in srgb, ${p} 12%, transparent)`;
  const tabSelText = local.tab_font_color ?? '#ffffff';
  const tabUnselText = local.tab_font_color ?? p;
  const colors = {
    text,
    textSec,
    primary: p,
    btnBg: local.button_color ?? p,
    btnText: local.button_text_color ?? '#ffffff',
  };
  const ef = (f: string | null) => (f ? `'${f}', '${local.font_family}'` : `'${local.font_family}'`);
  const fonts = {
    product: ef(local.font_product),
    price: ef(local.font_price),
    description: ef(local.font_description),
  };

  return (
    <div
      className="space-y-3 overflow-hidden rounded-2xl border border-neutral-200 p-5"
      style={{
        backgroundColor: bg,
        color: text,
        fontFamily: `'${local.font_family}', sans-serif`,
        backgroundImage: local.background_image_url ? `url(${local.background_image_url})` : undefined,
        backgroundSize: 'cover',
      }}
    >
      <p className="text-xl font-extrabold" style={{ color: text }}>{local.slogan || 'Tu Restaurante'}</p>
      <p className="text-xs" style={{ color: textSec }}>La mejor comida de la ciudad</p>

      {/* Category tab bar */}
      <div
        className="-mx-5 flex gap-2 px-5 py-2"
        style={{
          fontFamily: ef(local.font_category),
          backgroundColor: local.tab_bar_color ?? `color-mix(in srgb, ${bg} 90%, transparent)`,
        }}
      >
        <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: tabSelBg, color: tabSelText }}>Entradas</span>
        <span className="rounded-full px-3 py-1 text-xs font-medium" style={{ backgroundColor: tabUnselBg, color: tabUnselText }}>Postres</span>
      </div>

      <h3 className="pt-1 text-lg font-bold" style={{ color: local.secondary_color, fontFamily: ef(local.font_category) }}>Entradas</h3>
      <PreviewItem cardStyle={cardStyle} colors={colors} fonts={fonts} name="Tacos al pastor" price="$120" strike="$150" desc="Con piña, cebolla y cilantro." badge={BESTSELLER} />

      {/* Separator */}
      <div className="flex items-center gap-3 py-1">
        <span className="h-px flex-1" style={{ backgroundColor: sep }} />
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: textSec }}>Especiales</span>
        <span className="h-px flex-1" style={{ backgroundColor: sep }} />
      </div>

      <PreviewItem cardStyle={cardStyle} colors={colors} fonts={fonts} name="Quesadilla" price="$80" desc="Queso fundido y guacamole." />
    </div>
  );
}

function PreviewItem({
  cardStyle,
  colors,
  fonts,
  name,
  price,
  strike,
  desc,
  badge,
}: {
  cardStyle: React.CSSProperties;
  colors: { text: string; textSec: string; primary: string; btnBg: string; btnText: string };
  fonts: { product: string; price: string; description: string };
  name: string;
  price: string;
  strike?: string;
  desc?: string;
  badge?: { emoji: string; label: string; color: string; text: string };
}) {
  return (
    <div className="p-3" style={cardStyle}>
      {badge && (
        <span
          className="mb-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: badge.color, color: badge.text }}
        >
          {badge.emoji} {badge.label}
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold" style={{ color: colors.text, fontFamily: fonts.product }}>{name}</span>
        <span className="flex items-baseline gap-1.5" style={{ fontFamily: fonts.price }}>
          {strike && <span className="text-xs line-through" style={{ color: colors.textSec }}>{strike}</span>}
          <span className="font-semibold" style={{ color: colors.primary }}>{price}</span>
        </span>
      </div>
      {desc && <p className="mt-1 text-sm" style={{ color: colors.textSec, fontFamily: fonts.description }}>{desc}</p>}
      <button className="mt-3 rounded-full px-4 py-1.5 text-sm font-semibold" style={{ backgroundColor: colors.btnBg, color: colors.btnText }}>
        Agregar
      </button>
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
