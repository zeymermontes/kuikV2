'use client';

import { useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import type { TenantTheme, CategoryTheme } from '@/lib/database.types';
import { updateCategory } from '@/app/(dashboard)/menu/actions';
import { MENU_FONTS, CUSTOM_FONT } from '@/lib/config';
import { resolveMenuSettings, type MenuSettings } from '@/lib/menu-settings';
import { MENU_PRESETS, getPreset, presetSettings } from '@/lib/menu-presets';
import { Card, Label, Input } from '@/components/ui';
import { ImageUploader } from '@/components/dashboard/ImageUploader';
import { FontPicker } from '@/components/dashboard/FontPicker';
import { CustomFontUploader } from '@/components/dashboard/CustomFontUploader';
import { MusicUploader } from '@/components/dashboard/MusicUploader';
import { LivePreview } from '@/components/dashboard/LivePreview';

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

export function DesignForm({
  theme,
  previewUrl,
  published,
  categories = [],
}: {
  theme: TenantTheme;
  /** The tenant's public base URL, for the live preview iframe. */
  previewUrl: string;
  published: boolean;
  /** Top-level sections of the main menu, for their own tab colours. */
  categories?: { id: string; name: string; theme: CategoryTheme | null }[];
}) {
  const t = useTranslations('design');
  const locale = useLocale();
  const [local, setLocal] = useState(theme);
  const [settings, setSettings] = useState<MenuSettings>(
    resolveMenuSettings(theme.settings),
  );

  // What the live preview renders: the draft theme with the draft settings folded in.
  const previewTheme = useMemo(() => ({ ...local, settings: settings as unknown as TenantTheme['settings'] }), [local, settings]);

  // A section's own tab colours live on the category (Menu → section design);
  // edited here they save straight away and the preview reloads to show them.
  const [catThemes, setCatThemes] = useState<Record<string, CategoryTheme | null>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, c.theme])),
  );
  const [previewReload, setPreviewReload] = useState(0);
  function setCatTheme(id: string, key: keyof CategoryTheme, value: string | null) {
    const next: CategoryTheme = { ...(catThemes[id] ?? {}) };
    if (value) next[key] = value;
    else delete next[key];
    const theme = Object.keys(next).length ? next : null;
    setCatThemes((m) => ({ ...m, [id]: theme }));
    void updateCategory(id, { theme }).then(() => setPreviewReload((n) => n + 1));
  }

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

  // ── Find a setting ────────────────────────────────────────────────────────
  // The form has grown past what anyone scans by eye. Typing lists every row,
  // card heading or select *option* that matches ("scroll" finds Navigation
  // through its "Continuous scroll" choice); picking one scrolls it into view
  // and outlines it (.setting-hit). Plain DOM work: the rows are labelled.
  const rootRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SettingHit[]>([]);
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);

  function search(query: string) {
    setQ(query);
    setActive(0);
    setOpen(true);
    setHits(rootRef.current ? findSettings(rootRef.current, query) : []);
  }

  function goTo(hit: SettingHit) {
    const root = rootRef.current;
    root?.querySelectorAll('.setting-hit').forEach((el) => el.classList.remove('setting-hit'));
    hit.el.classList.add('setting-hit');
    hit.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setOpen(false);
  }

  function clearSearch() {
    setQ('');
    setHits([]);
    setOpen(false);
    rootRef.current?.querySelectorAll('.setting-hit').forEach((el) => el.classList.remove('setting-hit'));
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div ref={rootRef} className="space-y-5">
        <div className="sticky top-0 z-10 -mx-1 rounded-xl bg-neutral-50/95 px-1 py-2 backdrop-blur">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={q}
              onChange={(e) => search(e.target.value)}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setOpen(true);
                  setActive((i) => Math.min(i + 1, hits.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (hits[active]) goTo(hits[active]);
                } else if (e.key === 'Escape') {
                  clearSearch();
                }
              }}
              placeholder={t('searchSettings')}
              role="combobox"
              aria-expanded={open && q.trim().length >= 2}
              aria-controls="design-search-hits"
              className="w-full rounded-xl border border-neutral-300 bg-white py-2 pl-9 pr-32 text-sm focus:border-neutral-900 focus:outline-none"
            />
            {q.trim().length >= 2 && (
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500">
                {t('searchHits', { count: hits.length })}
              </span>
            )}
            {open && q.trim().length >= 2 && hits.length > 0 && (
              <ul
                id="design-search-hits"
                role="listbox"
                // Keep focus in the input so a tap on a row is not lost to blur.
                onMouseDown={(e) => e.preventDefault()}
                className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-lg"
              >
                {hits.map((h, i) => (
                  <li key={i} role="option" aria-selected={i === active}>
                    <button
                      type="button"
                      onClick={() => goTo(h)}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left ${
                        i === active ? 'bg-neutral-100' : ''
                      }`}
                    >
                      <span className="text-sm font-medium">
                        {h.label}
                        {h.option && <span className="font-normal text-amber-700"> · {h.option}</span>}
                      </span>
                      {h.section && <span className="text-xs text-neutral-500">{h.section}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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
          <h2 className="mb-1 font-semibold">{t('brand')}</h2>
          <p className="mb-4 text-xs text-neutral-500">{t('brandHint')}</p>

          <BrandImage
            label={t('logo')} hint={t('logoHint')} shape="circle" folder="logos"
            tenantId={theme.tenant_id}
            light={local.logo_url} dark={local.logo_dark_url}
            variant={settings.logoVariant}
            onLight={(url) => set('logo_url', url)}
            onDark={(url) => set('logo_dark_url', url)}
            onVariant={(v) => setS('logoVariant', v)}
            t={t}
          />
          <BrandImage
            label={t('logoWide')} hint={t('logoWideHint')} shape="wide" folder="logos"
            tenantId={theme.tenant_id}
            light={local.logo_wide_url} dark={local.logo_wide_dark_url}
            variant={settings.logoWideVariant}
            onLight={(url) => set('logo_wide_url', url)}
            onDark={(url) => set('logo_wide_dark_url', url)}
            onVariant={(v) => setS('logoWideVariant', v)}
            t={t}
          />
          <BrandImage
            label={t('favicon')} hint={t('faviconHint')} shape="square" folder="logos"
            tenantId={theme.tenant_id}
            light={local.favicon_url} dark={local.favicon_dark_url}
            variant={settings.faviconVariant}
            onLight={(url) => set('favicon_url', url)}
            onDark={(url) => set('favicon_dark_url', url)}
            onVariant={(v) => setS('faviconVariant', v)}
            t={t}
          />
          <BrandImage
            label={t('cover')} hint={t('coverHint')} shape="wide" folder="covers"
            tenantId={theme.tenant_id}
            light={local.cover_image_url} dark={local.cover_image_dark_url}
            variant={settings.coverVariant}
            onLight={(url) => set('cover_image_url', url)}
            onDark={(url) => set('cover_image_dark_url', url)}
            onVariant={(v) => setS('coverVariant', v)}
            t={t}
          />

          <div className="mt-4">
            <Label>{t('slogan')}</Label>
            <Input
              defaultValue={local.slogan ?? ''}
              placeholder={t('sloganPlaceholder')}
              onBlur={(e) => set('slogan', e.target.value || null)}
            />
          </div>
          <div className="mt-4 space-y-3">
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
              <div key={font} data-setting={label} className="rounded-lg border border-neutral-200 p-2">
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
          {settings.cardStyle === 'grid' && (
            <ToggleRow label={t('forceTwoColumns')} checked={settings.forceTwoColumns} onChange={(v) => setS('forceTwoColumns', v)} />
          )}
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
              ['footer', t('priceFooter')],
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
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{t('imageMaxHeight')}</span>
            <div className="flex flex-1 items-center gap-2">
              <input
                type="range"
                min={120}
                max={900}
                step={20}
                value={settings.imageMaxHeight}
                onChange={(e) => setS('imageMaxHeight', Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-neutral-900"
              />
              <span className="w-12 text-right text-[10px] text-neutral-400">
                {settings.imageMaxHeight}px
              </span>
            </div>
          </div>
          <p className="-mt-2 text-xs text-neutral-500">{t('imageMaxHeightHint')}</p>
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
          <ToggleRow label={t('cardDivider')} checked={settings.cardDivider} onChange={(v) => setS('cardDivider', v)} />
          <ToggleRow label={t('animations')} checked={settings.animations} onChange={(v) => setS('animations', v)} />
          <ToggleRow label={t('showAddButton')} checked={settings.showAddButton} onChange={(v) => setS('showAddButton', v)} />
          <ToggleRow label={t('showOptionKind')} checked={settings.showOptionKind} onChange={(v) => setS('showOptionKind', v)} />
          {/* The same knob as "photo position: none", worded as the question owners ask. */}
          <ToggleRow
            label={t('showImages')}
            checked={settings.imagePosition !== 'none'}
            onChange={(v) => setS('imagePosition', v ? 'auto' : 'none')}
          />
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

        {/* Header */}
        <Card className="space-y-4">
          <h2 className="font-semibold">{t('header')}</h2>
          <p className="-mt-2 text-xs text-neutral-500">{t('headerHint')}</p>
          <SelectRow
            label={t('headerStyle')}
            value={settings.headerStyle}
            onChange={(v) => setS('headerStyle', v as MenuSettings['headerStyle'])}
            options={[
              ['stacked', t('headerStacked')],
              ['bar', t('headerBar')],
            ]}
          />
          {/* Only the bar header has a wordmark to size or a width to span. */}
          {settings.headerStyle === 'bar' && (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{t('logoWideHeight')}</span>
                <div className="flex flex-1 items-center gap-2">
                  <input
                    type="range"
                    min={24}
                    max={96}
                    step={2}
                    value={settings.logoWideHeight}
                    onChange={(e) => setS('logoWideHeight', Number(e.target.value))}
                    className="h-1 flex-1 cursor-pointer accent-neutral-900"
                  />
                  <span className="w-10 text-right text-[10px] text-neutral-400">
                    {settings.logoWideHeight}px
                  </span>
                </div>
              </div>
              <p className="-mt-2 text-xs text-neutral-500">{t('logoWideHeightHint')}</p>
              <ToggleRow
                label={t('fullWidthHeader')}
                checked={settings.fullWidthHeader}
                onChange={(v) => setS('fullWidthHeader', v)}
              />
            </>
          )}
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
          <div data-setting={t('navInactiveOpacity')} className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{t('navInactiveOpacity')}</span>
            <div className="flex flex-1 items-center gap-2">
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={settings.navInactiveOpacity}
                onChange={(e) => setS('navInactiveOpacity', Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-neutral-900"
              />
              <span className="w-10 text-right text-[10px] text-neutral-400">{Math.round(settings.navInactiveOpacity * 100)}%</span>
            </div>
          </div>
          <div data-setting={t('navActiveOpacity')} className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{t('navActiveOpacity')}</span>
            <div className="flex flex-1 items-center gap-2">
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={settings.navActiveOpacity}
                onChange={(e) => setS('navActiveOpacity', Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer accent-neutral-900"
              />
              <span className="w-10 text-right text-[10px] text-neutral-400">{Math.round(settings.navActiveOpacity * 100)}%</span>
            </div>
          </div>
          {/* The same four theme colours the Colours card edits, repeated here
              because this is where owners look for them. */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['tab_selected_color', t('tabSelected'), local.primary_color],
                ['tab_unselected_color', t('tabUnselected'), '#eeeeee'],
                ['tab_font_color', t('tabFont'), local.text_color],
                ['tab_bar_color', t('tabBar'), '#ffffff'],
              ] as const
            ).map(([key, label, fallback]) => (
              <label key={key} data-setting={label} className="flex items-center gap-2 rounded-lg border border-neutral-200 px-2 py-1.5">
                <input
                  type="color"
                  value={(local[key] ?? fallback).slice(0, 7)}
                  onChange={(e) => set(key, e.target.value)}
                  data-inherit={!local[key]}
                  className="color-dot shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-medium">{label}</span>
                  <span className="block font-mono text-[10px] text-neutral-400">{local[key] ?? t('optAuto')}</span>
                </span>
                {local[key] && (
                  <button type="button" onClick={() => set(key, null)} className="px-1 text-neutral-300 hover:text-neutral-600" aria-label={t('clearColor')}>
                    ×
                  </button>
                )}
              </label>
            ))}
          </div>
          {categories.length > 0 && (
            <div data-setting={t('navPerCategory')} className="rounded-xl bg-neutral-50 p-3">
              <p className="text-xs font-medium text-neutral-500">{t('navPerCategory')}</p>
              <p className="mb-2 text-[10px] text-neutral-400">{t('navPerCategoryHint')}</p>
              <div className="space-y-2">
                {categories.map((c) => {
                  const th = catThemes[c.id];
                  return (
                    <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white px-2 py-1.5">
                      <span className="min-w-[6rem] flex-1 truncate text-sm font-medium">{c.name}</span>
                      {(
                        [
                          ['tab_selected_color', t('tabSelected'), local.tab_selected_color ?? local.primary_color],
                          ['tab_unselected_color', t('tabUnselected'), local.tab_unselected_color ?? '#eeeeee'],
                          ['tab_font_color', t('tabFont'), local.tab_font_color ?? local.text_color],
                          ['tab_selected_border_color', t('tabSelectedBorder'), local.tab_selected_color ?? local.primary_color],
                          ['tab_unselected_border_color', t('tabUnselectedBorder'), local.border_color ?? '#e5e5e5'],
                        ] as const
                      ).map(([key, label, fallback]) => (
                        <label key={key} title={label} className="flex items-center gap-1">
                          <input
                            type="color"
                            value={(th?.[key] ?? fallback).slice(0, 7)}
                            onChange={(e) => setCatTheme(c.id, key, e.target.value)}
                            data-inherit={!th?.[key]}
                            className="color-dot"
                          />
                          {th?.[key] && (
                            <button type="button" onClick={() => setCatTheme(c.id, key, null)} className="px-0.5 text-neutral-300 hover:text-neutral-600" aria-label={t('clearColor')}>
                              ×
                            </button>
                          )}
                        </label>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
          <ToggleRow label={t('showHours')} checked={settings.showHours} onChange={(v) => setS('showHours', v)} />
          <ToggleRow label={t('showDirections')} checked={settings.showDirections} onChange={(v) => setS('showDirections', v)} />
          <ToggleRow label={t('showSocial')} checked={settings.showSocial} onChange={(v) => setS('showSocial', v)} />
          <ToggleRow
            label={t('whatsappBubble')}
            checked={settings.whatsappBubble}
            onChange={(v) => setS('whatsappBubble', v)}
          />
          <p className="-mt-2 text-xs text-neutral-500">{t('whatsappBubbleHint')}</p>
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
        <LivePreview url={previewUrl} published={published} theme={previewTheme} reloadKey={previewReload} />
      </div>
    </div>
  );
}

/**
 * One brand image in both versions, plus which of them this slot uses.
 * Leaving the dark slot empty is fine — the light file is used everywhere,
 * which is exactly how menus behaved before dark versions existed.
 */
function BrandImage({
  label,
  hint,
  shape,
  folder,
  tenantId,
  light,
  dark,
  variant,
  onLight,
  onDark,
  onVariant,
  t,
}: {
  label: string;
  hint: string;
  shape: 'square' | 'wide' | 'circle';
  folder: string;
  tenantId: string;
  light: string | null;
  dark: string | null;
  variant: MenuSettings['logoVariant'];
  onLight: (url: string | null) => void;
  onDark: (url: string | null) => void;
  onVariant: (v: MenuSettings['logoVariant']) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-neutral-200 p-3">
      <div className="flex items-baseline justify-between gap-3">
        <Label>{label}</Label>
        <select
          value={variant}
          onChange={(e) => onVariant(e.target.value as MenuSettings['logoVariant'])}
          className="rounded-lg border border-neutral-300 px-2 py-1 text-xs"
        >
          <option value="auto">{t('variantAuto')}</option>
          <option value="light">{t('variantLight')}</option>
          <option value="dark">{t('variantDark')}</option>
        </select>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <div>
          <p className="mb-1 text-[11px] font-medium text-neutral-500">{t('versionLight')}</p>
          <ImageUploader value={light} tenantId={tenantId} folder={folder} shape={shape} onChange={onLight} />
        </div>
        <div className="rounded-lg bg-neutral-900 p-2">
          <p className="mb-1 text-[11px] font-medium text-neutral-300">{t('versionDark')}</p>
          <ImageUploader value={dark} tenantId={tenantId} folder={folder} shape={shape} onChange={onDark} />
        </div>
      </div>
      <p className="mt-2 text-xs text-neutral-500">{hint}</p>
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

interface SettingHit {
  /** The row (or whole card) to scroll to and outline. */
  el: HTMLElement;
  label: string;
  /** Heading of the card the row sits in; null when the hit is the card itself. */
  section: string | null;
  /** The select option that matched, when the label itself did not. */
  option: string | null;
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Every labelled row, card heading or select option under `root` matching `query`. */
function findSettings(root: HTMLElement, query: string): SettingHit[] {
  const nq = norm(query.trim());
  if (nq.length < 2) return [];
  const out: SettingHit[] = [];
  const sectionOf = (el: HTMLElement): string | null => {
    let card: HTMLElement = el;
    while (card.parentElement && card.parentElement !== root) card = card.parentElement;
    const h = card.querySelector('h2');
    return h && h !== el ? (h.textContent ?? '').trim() : null;
  };
  root.querySelectorAll<HTMLElement>('[data-setting], label, h2').forEach((el) => {
    // A toggle's <label> is the row; a field's <label> sits above its input,
    // so the row is its parent; a heading stands for its whole card.
    const target = el.matches('[data-setting]')
      ? el
      : el.tagName === 'H2' || !el.querySelector('input')
        ? el.parentElement
        : el;
    if (!target || out.some((h) => h.el === target)) return;
    const label = (el.dataset.setting ?? (el.tagName === 'H2' ? el.textContent : el.querySelector('span')?.textContent ?? el.textContent) ?? '').trim();
    let option: string | null = null;
    if (!norm(label).includes(nq)) {
      const opt = Array.from(target.querySelectorAll('option')).find((o) => norm(o.textContent ?? '').includes(nq));
      if (!opt) return;
      option = (opt.textContent ?? '').trim();
    }
    out.push({ el: target, label, section: el.tagName === 'H2' ? null : sectionOf(target), option });
  });
  return out;
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
    <div data-setting={label} className="flex items-center justify-between gap-3">
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
    <label data-setting={label} className="flex cursor-pointer items-center justify-between gap-3">
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
