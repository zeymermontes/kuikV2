'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import type { TenantTheme } from '@/lib/database.types';
import { MENU_FONTS, CUSTOM_FONT } from '@/lib/config';
import { BADGES } from '@/lib/badges';
import {
  resolveMenuSettings,
  resolveItemLayout,
  ALIGN_CLASS,
  JUSTIFY_CLASS,
  ITEMS_CLASS,
  textTransform,
  type MenuSettings,
  type ItemLayout,
} from '@/lib/menu-settings';
import { MENU_PRESETS, getPreset, presetSettings } from '@/lib/menu-presets';
import { Card, Label, Input } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import { FontPicker } from '@/components/dashboard/FontPicker';
import { CustomFontUploader } from '@/components/dashboard/CustomFontUploader';
import { MusicUploader } from '@/components/dashboard/MusicUploader';

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
  applyMenuPreset,
} from '@/app/(dashboard)/settings-actions';

export function DesignForm({ theme }: { theme: TenantTheme }) {
  const t = useTranslations('design');
  const locale = useLocale();
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

  // Apply a named look: writes every colour/font/layout knob the preset
  // declares, in one server round trip.
  function applyPreset(id: string) {
    const preset = getPreset(id);
    if (!preset) return;
    setLocal((s) => ({ ...s, ...preset.theme }));
    setSettings((s) => ({ ...s, ...presetSettings(preset) }));
    applyMenuPreset(id);
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
    | 'button_color' | 'button_text_color'
    | 'search_bg_color' | 'search_text_color' | 'search_border_color';

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
    { key: 'tab_bar_color', label: t('tabBar'), fallback: '#ffffff' },
    { key: 'tab_selected_color', label: t('tabSelected'), fallback: local.primary_color },
    { key: 'tab_unselected_color', label: t('tabUnselected'), fallback: '#eeeeee' },
    { key: 'tab_font_color', label: t('tabFont'), fallback: local.text_color },
    { key: 'search_bg_color', label: t('searchBg'), fallback: local.card_color },
    { key: 'search_text_color', label: t('searchText'), fallback: local.text_color },
    { key: 'search_border_color', label: t('searchBorder'), fallback: local.border_color },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-5">
        {/* Presets */}
        <Card>
          <h2 className="font-semibold">{t('presets')}</h2>
          <p className="mt-1 text-xs text-neutral-500">{t('presetsHint')}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {MENU_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                className="flex items-center gap-3 rounded-xl border border-neutral-200 p-3 text-left transition hover:border-neutral-900"
              >
                <span className="flex h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-neutral-200">
                  <span className="flex-1" style={{ backgroundColor: p.swatch[0] }} />
                  <span className="flex-1" style={{ backgroundColor: p.swatch[1] }} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{p.name}</span>
                  <span className="block text-xs leading-snug text-neutral-500">
                    {p.blurb[locale === 'en' ? 'en' : 'es']}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Card>

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
            <Label>{t('logoWide')}</Label>
            <ImageUploader
              value={local.logo_wide_url}
              tenantId={theme.tenant_id}
              folder="logos"
              shape="wide"
              onChange={(url) => set('logo_wide_url', url)}
            />
            <p className="mt-1 text-xs text-neutral-500">{t('logoWideHint')}</p>
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
            <ToggleRow
              label={t('showSlogan')}
              checked={settings.showSlogan}
              onChange={(v) => setS('showSlogan', v)}
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

          {/* Per-element fonts + style */}
          <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4">
            <p className="text-xs font-medium text-neutral-500">{t('perElementFonts')}</p>
            {(
              [
                { font: 'font_category', label: t('fontCategory'), bold: 'categoryBold', italic: 'categoryItalic', size: 'categorySize' },
                { font: 'font_product', label: t('fontProduct'), bold: 'productBold', italic: 'productItalic', size: 'productSize' },
                { font: 'font_price', label: t('fontPrice'), bold: 'priceBold', italic: 'priceItalic', size: 'priceSize' },
                { font: 'font_description', label: t('fontDescription'), bold: 'descriptionBold', italic: 'descriptionItalic', size: 'descriptionSize' },
              ] as const
            ).map(({ font, label, bold, italic, size }) => (
              <div key={font} className="rounded-lg border border-neutral-200 p-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{label}</span>
                  <select
                    value={local[font] ?? ''}
                    onChange={(e) => set(font, e.target.value || null)}
                    className="rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                    style={{ fontFamily: local[font] ? `'${local[font]}'` : undefined }}
                  >
                    <option value="">{t('inheritFont')}</option>
                    {MENU_FONTS.map((f) => (
                      <option key={f} value={f} style={{ fontFamily: `'${f}'` }}>{f}</option>
                    ))}
                    {local.custom_font_url && (
                      <option value={CUSTOM_FONT} style={{ fontFamily: `'${CUSTOM_FONT}'` }}>
                        {local.custom_font_name || t('customFont')}
                      </option>
                    )}
                  </select>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <StyleToggle active={settings[bold]} onClick={() => setS(bold, !settings[bold])} className="font-bold">B</StyleToggle>
                  <StyleToggle active={settings[italic]} onClick={() => setS(italic, !settings[italic])} className="italic">I</StyleToggle>
                  <input
                    type="range"
                    min={0.7}
                    max={2}
                    step={0.05}
                    value={settings[size]}
                    onChange={(e) => setS(size, Number(e.target.value))}
                    className="h-1 flex-1 cursor-pointer accent-neutral-900"
                  />
                  <span className="w-9 text-right text-[10px] text-neutral-400">{Math.round(settings[size] * 100)}%</span>
                </div>
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
              ['classic', t('cardClassic')],
            ]}
          />
          <SelectRow
            label={t('contentWidth')}
            value={settings.contentWidth}
            onChange={(v) => setS('contentWidth', v as MenuSettings['contentWidth'])}
            options={[
              ['narrow', t('widthNarrow')],
              ['normal', t('widthNormal')],
              ['wide', t('widthWide')],
              ['full', t('widthFull')],
            ]}
          />
          <SelectRow
            label={t('cardSurface')}
            value={settings.cardSurface}
            onChange={(v) => setS('cardSurface', v as MenuSettings['cardSurface'])}
            options={[
              ['auto', t('optAuto')],
              ['on', t('surfaceOn')],
              ['off', t('surfaceOff')],
            ]}
          />
          <SelectRow
            label={t('itemAlign')}
            value={settings.itemAlign}
            onChange={(v) => setS('itemAlign', v as MenuSettings['itemAlign'])}
            options={[
              ['auto', t('optAuto')],
              ['left', t('alignLeft')],
              ['center', t('alignCenter')],
              ['right', t('alignRight')],
            ]}
          />
          <SelectRow
            label={t('priceStyle')}
            value={settings.priceStyle}
            onChange={(v) => setS('priceStyle', v as MenuSettings['priceStyle'])}
            options={[
              ['auto', t('optAuto')],
              ['right', t('priceRight')],
              ['inline', t('priceInline')],
              ['dots', t('priceDots')],
              ['below', t('priceBelow')],
            ]}
          />
          <SelectRow
            label={t('imagePosition')}
            value={settings.imagePosition}
            onChange={(v) => setS('imagePosition', v as MenuSettings['imagePosition'])}
            options={[
              ['auto', t('optAuto')],
              ['top', t('posTop')],
              ['bottom', t('posBottom')],
              ['left', t('posLeft')],
              ['right', t('posRight')],
              ['none', t('posNone')],
            ]}
          />
          <SelectRow
            label={t('imageSize')}
            value={settings.imageSize}
            onChange={(v) => setS('imageSize', v as MenuSettings['imageSize'])}
            options={[
              ['auto', t('optAuto')],
              ['thumb', t('sizeThumb')],
              ['medium', t('sizeMedium')],
              ['full', t('sizeFull')],
            ]}
          />
          <SelectRow
            label={t('imageRatio')}
            value={settings.imageRatio}
            onChange={(v) => setS('imageRatio', v as MenuSettings['imageRatio'])}
            options={[
              ['auto', t('optAuto')],
              ['natural', t('ratioNatural')],
              ['square', t('ratioSquare')],
              ['video', t('ratioVideo')],
              ['wide', t('ratioWide')],
            ]}
          />
          <SelectRow
            label={t('itemSpacing')}
            value={settings.itemSpacing}
            onChange={(v) => setS('itemSpacing', v as MenuSettings['itemSpacing'])}
            options={[
              ['auto', t('optAuto')],
              ['none', t('spacingNone')],
              ['tight', t('spacingTight')],
              ['normal', t('spacingNormal')],
              ['loose', t('spacingLoose')],
              ['roomy', t('spacingRoomy')],
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
          <ToggleRow label={t('showAddButton')} checked={settings.showAddButton} onChange={(v) => setS('showAddButton', v)} />
          <SelectRow
            label={t('productCase')}
            value={settings.productCase}
            onChange={(v) => setS('productCase', v as MenuSettings['productCase'])}
            options={[['none', t('caseNone')], ['upper', t('caseUpper')]]}
          />
          <SelectRow
            label={t('descriptionCase')}
            value={settings.descriptionCase}
            onChange={(v) => setS('descriptionCase', v as MenuSettings['descriptionCase'])}
            options={[['none', t('caseNone')], ['upper', t('caseUpper')]]}
          />
        </Card>

        {/* Section headings */}
        <Card className="space-y-4">
          <h2 className="font-semibold">{t('sections')}</h2>
          <SelectRow
            label={t('categoryAlign')}
            value={settings.categoryAlign}
            onChange={(v) => setS('categoryAlign', v as MenuSettings['categoryAlign'])}
            options={[
              ['left', t('alignLeft')],
              ['center', t('alignCenter')],
              ['right', t('alignRight')],
            ]}
          />
          <SelectRow
            label={t('categoryRule')}
            value={settings.categoryRule}
            onChange={(v) => setS('categoryRule', v as MenuSettings['categoryRule'])}
            options={[
              ['none', t('ruleNone')],
              ['under', t('ruleUnder')],
              ['both', t('ruleBoth')],
            ]}
          />
          <SelectRow
            label={t('categoryCase')}
            value={settings.categoryCase}
            onChange={(v) => setS('categoryCase', v as MenuSettings['categoryCase'])}
            options={[['none', t('caseNone')], ['upper', t('caseUpper')]]}
          />
          <ToggleRow label={t('categoryIcons')} checked={settings.categoryIcons} onChange={(v) => setS('categoryIcons', v)} />
          <SelectRow
            label={t('categoryTitle')}
            value={settings.categoryTitle}
            onChange={(v) => setS('categoryTitle', v as MenuSettings['categoryTitle'])}
            options={[
              ['always', t('titleAlways')],
              ['auto', t('titleAuto')],
              ['never', t('titleNever')],
            ]}
          />
          <SelectRow
            label={t('subcategoryRule')}
            value={settings.subcategoryRule}
            onChange={(v) => setS('subcategoryRule', v as MenuSettings['subcategoryRule'])}
            options={[
              ['none', t('ruleNone')],
              ['under', t('ruleUnder')],
              ['both', t('ruleBoth')],
            ]}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{t('subcategorySize')}</span>
            <div className="flex flex-1 items-center gap-2">
              <input
                type="range"
                min={0.4}
                max={1}
                step={0.02}
                value={settings.subcategorySize}
                onChange={(e) => setS('subcategorySize', Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-neutral-900"
              />
              <span className="w-10 text-right text-[10px] text-neutral-400">
                {Math.round(settings.subcategorySize * 100)}%
              </span>
            </div>
          </div>
        </Card>

        {/* Category tab bar */}
        <Card className="space-y-4">
          <h2 className="font-semibold">{t('navBar')}</h2>
          <p className="-mt-2 text-xs text-neutral-500">{t('navBarHint')}</p>
          <SelectRow
            label={t('navIconPosition')}
            value={settings.navIconPosition}
            onChange={(v) => setS('navIconPosition', v as MenuSettings['navIconPosition'])}
            options={[
              ['left', t('navIconLeft')],
              ['top', t('navIconTop')],
              ['bottom', t('navIconBottom')],
              ['none', t('navIconNone')],
            ]}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{t('navIconSize')}</span>
            <div className="flex flex-1 items-center gap-2">
              <input
                type="range"
                min={14}
                max={64}
                step={2}
                value={settings.navIconSize}
                onChange={(e) => setS('navIconSize', Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-neutral-900"
              />
              <span className="w-10 text-right text-[10px] text-neutral-400">{settings.navIconSize}px</span>
            </div>
          </div>
          <SelectRow
            label={t('headerStyle')}
            value={settings.headerStyle}
            onChange={(v) => setS('headerStyle', v as MenuSettings['headerStyle'])}
            options={[
              ['stacked', t('headerStacked')],
              ['bar', t('headerBar')],
            ]}
          />
          <ToggleRow
            label={t('fullWidthHeader')}
            checked={settings.fullWidthHeader}
            onChange={(v) => setS('fullWidthHeader', v)}
          />
          <SelectRow
            label={t('navIconShape')}
            value={settings.navIconShape}
            onChange={(v) => setS('navIconShape', v as MenuSettings['navIconShape'])}
            options={[
              ['plain', t('navShapeIconPlain')],
              ['circle', t('navShapeIconCircle')],
            ]}
          />
          <SelectRow
            label={t('navTabShape')}
            value={settings.navTabShape}
            onChange={(v) => setS('navTabShape', v as MenuSettings['navTabShape'])}
            options={[
              ['pill', t('navShapePill')],
              ['plain', t('navShapePlain')],
            ]}
          />
        </Card>

        {/* Options printed in the menu */}
        <Card className="space-y-4">
          <h2 className="font-semibold">{t('inlineOptions')}</h2>
          <p className="-mt-2 text-xs text-neutral-500">{t('inlineOptionsHint')}</p>
          <ToggleRow label={t('showInlineOptions')} checked={settings.showInlineOptions} onChange={(v) => setS('showInlineOptions', v)} />
          <SelectRow
            label={t('inlineOptionColumns')}
            value={String(settings.inlineOptionColumns)}
            onChange={(v) => setS('inlineOptionColumns', Number(v))}
            options={[['1', '1'], ['2', '2'], ['3', '3']]}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{t('inlineOptionBullet')}</span>
            <input
              value={settings.inlineOptionBullet}
              maxLength={4}
              onChange={(e) => setS('inlineOptionBullet', e.target.value)}
              className="w-20 rounded-lg border border-neutral-300 px-2 py-1.5 text-center text-sm"
            />
          </div>
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
          <ToggleRow label={t('showBadges')} checked={settings.showBadges} onChange={(v) => setS('showBadges', v)} />
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

        <Card>
          <Label>{t('backgroundMusic')}</Label>
          <MusicUploader
            value={local.background_music_url}
            volume={local.background_music_volume ?? 50}
            tenantId={theme.tenant_id}
            onChange={(url) => set('background_music_url', url)}
            onVolume={(v) => set('background_music_volume', v)}
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
  const layout = resolveItemLayout(settings);
  const dark = settings.darkMode === 'on';
  const bg = dark ? '#111114' : local.background_color;
  const text = dark ? '#f5f5f5' : local.text_color;
  const textSec = dark ? 'rgba(245,245,245,.6)' : local.text_secondary_color ?? '#737373';
  const card = dark ? 'rgba(255,255,255,.07)' : local.card_color ?? '#ffffff';
  const border = dark ? 'rgba(255,255,255,.12)' : local.border_color ?? '#e5e5e5';
  const sep = local.separator_color ?? '#e5e5e5';
  const radius = { none: 0, sm: 8, md: 12, lg: 16, xl: 24 }[settings.cornerRadius] ?? 16;

  const cardStyle: React.CSSProperties = {
    backgroundColor: layout.surface ? card : undefined,
    borderRadius: radius,
    border: layout.surface && settings.cardBorder ? `1px solid ${border}` : undefined,
    boxShadow: layout.surface && settings.cardShadow ? '0 1px 6px rgba(0,0,0,.08)' : undefined,
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
    card,
  };
  const searchBg = local.search_bg_color ?? local.card_color ?? '#ffffff';
  const searchText = local.search_text_color ?? text;
  const searchBorder = local.search_border_color ?? local.border_color ?? '#e5e5e5';
  const ef = (f: string | null) => (f ? `'${f}', '${local.font_family}'` : `'${local.font_family}'`);
  const elStyle = (f: string | null, b: boolean, i: boolean, size: number, base: number): React.CSSProperties => ({
    fontFamily: ef(f),
    fontWeight: b ? 700 : 400,
    fontStyle: i ? 'italic' : 'normal',
    fontSize: `${base * size}rem`,
  });
  const styles = {
    category: elStyle(local.font_category, settings.categoryBold, settings.categoryItalic, settings.categorySize, 1.25),
    product: elStyle(local.font_product, settings.productBold, settings.productItalic, settings.productSize, 1),
    price: elStyle(local.font_price, settings.priceBold, settings.priceItalic, settings.priceSize, 1),
    description: elStyle(local.font_description, settings.descriptionBold, settings.descriptionItalic, settings.descriptionSize, 0.875),
  };

  const rule = <span className="my-1.5 block h-px w-full" style={{ backgroundColor: sep }} />;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-neutral-200 p-5"
      style={{
        backgroundColor: bg,
        color: text,
        fontFamily: `'${local.font_family}', sans-serif`,
        backgroundImage: local.background_image_url ? `url(${local.background_image_url})` : undefined,
        backgroundSize: 'cover',
      }}
    >
      <div className="space-y-3">
        <p className="text-xl font-extrabold" style={{ color: text }}>{local.slogan || 'Tu Restaurante'}</p>
        <p className="text-xs" style={{ color: textSec }}>La mejor comida de la ciudad</p>

        {/* Search bar */}
        {settings.showSearch && (
          <div
            className="flex items-center gap-2 rounded-full border px-3 py-2 text-xs"
            style={{ backgroundColor: searchBg, color: searchText, borderColor: searchBorder }}
          >
            <span className="opacity-50">🔍</span>
            <span className="flex-1 opacity-50">Buscar…</span>
          </div>
        )}

        {/* Category tab bar */}
        <div
          className="-mx-5 flex gap-2 px-5 py-2"
          style={{
            fontFamily: ef(local.font_category),
            backgroundColor:
              local.tab_bar_color ?? `color-mix(in srgb, ${dark ? '#111114' : '#ffffff'} 90%, transparent)`,
          }}
        >
          {[
            { label: 'Entradas', on: true },
            { label: 'Postres', on: false },
          ].map((tab) => (
            <PreviewTab
              key={tab.label}
              label={tab.label}
              active={tab.on}
              settings={settings}
              bg={tab.on ? tabSelBg : tabUnselBg}
              color={tab.on ? tabSelText : tabUnselText}
            />
          ))}
        </div>
      </div>

      {/* Section heading */}
      <div className={`pt-2 ${ALIGN_CLASS[settings.categoryAlign]}`}>
        {settings.categoryRule === 'both' && rule}
        <h3
          style={{
            color: local.secondary_color,
            textTransform: textTransform(settings.categoryCase),
            ...styles.category,
          }}
        >
          Entradas
        </h3>
        {settings.categoryRule !== 'none' && rule}
      </div>

      <div
        className={layout.columns === 2 ? 'grid grid-cols-2' : 'flex flex-col'}
        style={{ gap: layout.gap, marginTop: '0.5rem' }}
      >
        <PreviewItem
          layout={layout} settings={settings} cardStyle={cardStyle} colors={colors} styles={styles} radius={radius}
          name="Tacos al pastor" price="$120" strike="$150" desc="Con piña, cebolla y cilantro." photo badge={BESTSELLER}
        />
        {/* Separator */}
        <div className={`flex items-center gap-3 py-1 ${layout.columns === 2 ? 'col-span-2' : ''}`}>
          <span className="h-px flex-1" style={{ backgroundColor: sep }} />
          <span className="text-xs font-medium uppercase tracking-wide" style={{ color: textSec }}>Especiales</span>
          <span className="h-px flex-1" style={{ backgroundColor: sep }} />
        </div>

        <PreviewItem
          layout={layout} settings={settings} cardStyle={cardStyle} colors={colors} styles={styles} radius={radius}
          name="Quesadilla" price="$80" desc="Queso fundido y guacamole."
          options={['Pollo', 'Res', 'Chorizo', 'Rajas']}
        />
      </div>
    </div>
  );
}

/** One chip in the previewed category bar, honouring the nav icon settings. */
function PreviewTab({
  label,
  active,
  settings,
  bg,
  color,
}: {
  label: string;
  active: boolean;
  settings: MenuSettings;
  bg: string;
  color: string;
}) {
  const stacked = settings.navIconPosition === 'top' || settings.navIconPosition === 'bottom';
  const plain = settings.navTabShape === 'plain';
  const glyph = <span style={{ fontSize: settings.navIconSize * 0.7, lineHeight: 1 }}>🍽️</span>;
  const icon = settings.navIconPosition !== 'none' &&
    (settings.navIconShape === 'circle' ? (
      <span
        className="flex shrink-0 items-center justify-center rounded-full"
        style={{ width: settings.navIconSize * 1.15, height: settings.navIconSize * 1.15, backgroundColor: bg }}
      >
        {glyph}
      </span>
    ) : (
      glyph
    ));
  return (
    <span
      className={`flex items-center text-xs ${stacked ? 'w-16 flex-col gap-1 text-center leading-tight' : 'gap-1.5'} ${
        plain ? 'px-1' : 'rounded-full px-3 py-1'
      } ${active ? 'font-bold' : 'font-medium'}`}
      style={{
        backgroundColor: plain ? 'transparent' : bg,
        color,
        opacity: plain && !active ? 0.7 : 1,
      }}
    >
      {settings.navIconPosition !== 'bottom' && icon}
      <span>{label}</span>
      {settings.navIconPosition === 'bottom' && icon}
    </span>
  );
}

function PreviewItem({
  layout,
  settings,
  cardStyle,
  colors,
  styles,
  radius,
  name,
  price,
  strike,
  desc,
  badge,
  photo,
  options,
}: {
  layout: ItemLayout;
  settings: MenuSettings;
  cardStyle: React.CSSProperties;
  colors: { text: string; textSec: string; primary: string; btnBg: string; btnText: string; card: string };
  styles: { product: React.CSSProperties; price: React.CSSProperties; description: React.CSSProperties };
  radius: number;
  name: string;
  price: string;
  strike?: string;
  desc?: string;
  badge?: { emoji: string; label: string; color: string; text: string };
  photo?: boolean;
  options?: string[];
}) {
  const align = layout.align;
  const showImage = layout.image !== 'none' && Boolean(photo);
  const beside = showImage && (layout.image === 'left' || layout.image === 'right');
  const pad = settings.density === 'compact' ? 8 : 12;
  const flush = showImage && !beside && layout.imageSize === 'full' && layout.surface;

  const ratio = layout.imageRatio === 'video' ? '16 / 9'
    : layout.imageRatio === 'wide' ? '21 / 9'
    : layout.imageRatio === 'natural' ? '4 / 3'
    : '1 / 1';
  const blockWidth = layout.imageSize === 'full' ? '100%' : layout.imageSize === 'medium' ? '66%' : '33%';

  const img = showImage && (
    <span
      className="block shrink-0 bg-neutral-200 bg-gradient-to-br from-neutral-200 to-neutral-300"
      style={
        beside
          ? { width: layout.imageSize === 'thumb' ? 48 : 60, height: layout.imageSize === 'thumb' ? 48 : 60, borderRadius: settings.imageShape === 'circle' ? 999 : settings.imageShape === 'square' ? 0 : 8 }
          : {
              width: blockWidth,
              aspectRatio: ratio,
              marginLeft: align === 'center' ? 'auto' : align === 'right' ? 'auto' : undefined,
              marginRight: align === 'center' ? 'auto' : undefined,
              borderRadius: flush ? 0 : settings.imageShape === 'square' ? 0 : 8,
            }
      }
    />
  );

  const priceEl = (
    <span className="inline-flex items-baseline gap-1.5" style={styles.price}>
      {strike && <span className="text-xs line-through" style={{ color: colors.textSec }}>{strike}</span>}
      <span style={{ color: colors.primary }}>{price}</span>
    </span>
  );
  const nameEl = (
    <span style={{ color: colors.text, textTransform: textTransform(settings.productCase), ...styles.product }}>
      {name}
      {layout.price === 'inline' && <span className="ml-2">{priceEl}</span>}
    </span>
  );

  let titleRow: React.ReactNode = nameEl;
  if (layout.price === 'below') {
    titleRow = <>{nameEl}<span className="mt-0.5 block">{priceEl}</span></>;
  } else if (layout.price === 'dots') {
    titleRow = (
      <span className="flex w-full items-baseline gap-2">
        <span className="shrink-0">{nameEl}</span>
        <span className="min-w-4 flex-1 border-b border-dotted opacity-40" style={{ borderColor: colors.textSec }} />
        <span className="shrink-0">{priceEl}</span>
      </span>
    );
  } else if (layout.price === 'right') {
    titleRow = (
      <span className="flex w-full items-start justify-between gap-2">{nameEl}{priceEl}</span>
    );
  }

  const body = (
    <div className={`flex min-w-0 flex-1 flex-col ${ALIGN_CLASS[align]} ${ITEMS_CLASS[align]}`}>
      {badge && settings.showBadges && (
        <span
          className="mb-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: badge.color, color: badge.text }}
        >
          {badge.emoji} {badge.label}
        </span>
      )}
      {titleRow}
      {desc && (
        <p className="mt-1" style={{ color: colors.textSec, textTransform: textTransform(settings.descriptionCase), ...styles.description }}>
          {desc}
        </p>
      )}
      {settings.showInlineOptions && options && (
        <div className="mt-1.5 w-full">
          <span className={`block text-[11px] font-semibold ${ALIGN_CLASS[align]}`} style={{ color: colors.primary }}>
            Proteína a elegir
          </span>
          <div
            className={`mt-1 grid gap-1 ${align === 'center' ? 'mx-auto w-[85%]' : 'w-full'}`}
            style={{ gridTemplateColumns: `repeat(${settings.inlineOptionColumns}, minmax(0, 1fr))` }}
          >
            {options.map((o) => (
              <span key={o} className="px-1.5 py-0.5 text-left text-[11px]" style={{ backgroundColor: colors.card, borderRadius: radius / 2 }}>
                {settings.inlineOptionBullet} {o}
              </span>
            ))}
          </div>
        </div>
      )}
      {settings.showAddButton && (
        <span className={`mt-2 flex ${JUSTIFY_CLASS[align]}`}>
          <span className="rounded-full px-4 py-1.5 text-xs font-semibold" style={{ backgroundColor: colors.btnBg, color: colors.btnText }}>
            Agregar
          </span>
        </span>
      )}
    </div>
  );

  return (
    <div
      className={`flex ${beside ? (layout.image === 'right' ? 'flex-row-reverse gap-3' : 'gap-3') : 'flex-col gap-2'} overflow-hidden`}
      style={{ ...cardStyle, padding: layout.surface && !flush ? pad : undefined }}
    >
      {(layout.image === 'top' || beside) && img}
      {flush ? <div className="flex flex-1 flex-col" style={{ padding: pad }}>{body}</div> : body}
      {layout.image === 'bottom' && img}
    </div>
  );
}

function StyleToggle({
  active,
  onClick,
  className,
  children,
}: {
  active: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-md border text-sm ${
        active ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300 text-neutral-600'
      } ${className ?? ''}`}
    >
      {children}
    </button>
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
