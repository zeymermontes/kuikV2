'use client';

import { useTranslations } from 'next-intl';
import { LayoutGrid } from 'lucide-react';
import { DeviceFrame } from './PosPreview';

/** The host stand in a tablet frame, on sample data, so an owner sees it before drawing a plan. */
export function HostPreview() {
  const t = useTranslations('reservations');
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
          <LayoutGrid className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{t('hostPreviewTitle')}</h2>
          <p className="text-sm text-neutral-500">{t('hostPreviewHint')}</p>
        </div>
      </div>
      <DeviceFrame title={t('hostStand')} src="/host?demo=1" openHref="/host" openLabel={t('openHost')} />
    </section>
  );
}
