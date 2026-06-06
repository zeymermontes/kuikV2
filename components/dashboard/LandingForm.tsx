'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { TenantLanding, Product } from '@/lib/database.types';
import { Card, Label, Input } from '@/components/ui';
import { updateLanding } from '@/app/(dashboard)/settings-actions';

const MAX_FEATURED = 8;

export function LandingForm({
  landing,
  products,
}: {
  landing: TenantLanding;
  products: Pick<Product, 'id' | 'name' | 'image_url'>[];
}) {
  const t = useTranslations('landing');
  const [l, setL] = useState(landing);

  function set<K extends keyof TenantLanding>(key: K, value: TenantLanding[K]) {
    setL((s) => ({ ...s, [key]: value }));
    updateLanding({ [key]: value });
  }

  function toggleFeatured(id: string) {
    const has = l.featured_product_ids.includes(id);
    const next = has
      ? l.featured_product_ids.filter((x) => x !== id)
      : [...l.featured_product_ids, id].slice(0, MAX_FEATURED);
    set('featured_product_ids', next);
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Enable / disable */}
      <Card>
        <h2 className="mb-1 font-semibold">{t('mode')}</h2>
        <p className="mb-3 text-sm text-neutral-500">{t('modeHint')}</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => set('enabled', true)}
            className={`rounded-xl border p-3 text-left transition ${
              l.enabled ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
            }`}
          >
            <span className="block text-sm font-semibold">{t('modeOn')}</span>
            <span className="block text-xs opacity-70">{t('modeOnHint')}</span>
          </button>
          <button
            onClick={() => set('enabled', false)}
            className={`rounded-xl border p-3 text-left transition ${
              !l.enabled ? 'border-neutral-900 bg-neutral-900 text-white' : 'border-neutral-300'
            }`}
          >
            <span className="block text-sm font-semibold">{t('modeOff')}</span>
            <span className="block text-xs opacity-70">{t('modeOffHint')}</span>
          </button>
        </div>
      </Card>

      {l.enabled && (
        <>
          {/* Hero text */}
          <Card className="space-y-4">
            <h2 className="font-semibold">{t('hero')}</h2>
            <p className="-mt-2 text-xs text-neutral-400">{t('heroHint')}</p>
            <div>
              <Label>{t('welcomeTitle')}</Label>
              <Input
                defaultValue={l.welcome_title ?? ''}
                placeholder={t('welcomePlaceholder')}
                onBlur={(e) => set('welcome_title', e.target.value || null)}
              />
            </div>
            <div>
              <Label>{t('tagline')}</Label>
              <Input
                defaultValue={l.tagline ?? ''}
                placeholder={t('taglinePlaceholder')}
                onBlur={(e) => set('tagline', e.target.value || null)}
              />
            </div>
          </Card>

          {/* Featured products */}
          <Card>
            <h2 className="mb-1 font-semibold">{t('featured')}</h2>
            <p className="mb-3 text-sm text-neutral-500">{t('featuredHint', { max: MAX_FEATURED })}</p>
            {products.length === 0 ? (
              <p className="text-sm text-neutral-400">{t('noProducts')}</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {products.map((p) => {
                  const on = l.featured_product_ids.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      onClick={() => toggleFeatured(p.id)}
                      className={`flex items-center gap-2 rounded-xl border p-2 text-left transition ${
                        on ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200'
                      }`}
                    >
                      {p.image_url ? (
                        <Image
                          src={p.image_url}
                          alt=""
                          width={36}
                          height={36}
                          className="h-9 w-9 shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <span className="h-9 w-9 shrink-0 rounded-lg bg-neutral-100" />
                      )}
                      <span className="line-clamp-2 text-xs font-medium">{p.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          {/* Rating */}
          <Card className="space-y-4">
            <ToggleRow
              label={t('showRating')}
              checked={l.show_rating}
              onChange={(v) => set('show_rating', v)}
            />
            {l.show_rating && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label>{t('rating')}</Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="5"
                    inputMode="decimal"
                    defaultValue={l.rating ?? ''}
                    placeholder="4.9"
                    onBlur={(e) =>
                      set('rating', e.target.value === '' ? null : Number(e.target.value))
                    }
                  />
                </div>
                <div>
                  <Label>{t('reviewsUrl')}</Label>
                  <Input
                    defaultValue={l.reviews_url ?? ''}
                    placeholder="https://g.page/..."
                    onBlur={(e) => set('reviews_url', e.target.value || null)}
                  />
                </div>
              </div>
            )}
          </Card>

          {/* WiFi */}
          <Card>
            <Label>{t('wifi')}</Label>
            <Input
              defaultValue={l.wifi_password ?? ''}
              placeholder={t('wifiPlaceholder')}
              onBlur={(e) => set('wifi_password', e.target.value || null)}
            />
            <p className="mt-1 text-xs text-neutral-400">{t('wifiHint')}</p>
          </Card>

          <p className="text-xs text-neutral-400">{t('coverNote')}</p>
        </>
      )}
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
