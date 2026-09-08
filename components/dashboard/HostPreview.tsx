'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LayoutGrid, Lock } from 'lucide-react';
import { DeviceFrame } from './PosPreview';

/**
 * The host stand in a tablet frame, on sample data, so an owner sees it
 * before drawing a plan. `locked` (a Menú plan): no frame, a plain note that
 * the stand comes with Restaurante, and a link to the demo.
 */
export function HostPreview({ locked = false }: { locked?: boolean }) {
  const t = useTranslations('reservations');
  return (
    <section className="mt-8">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-700">
          {locked ? <Lock className="h-5 w-5" /> : <LayoutGrid className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold">{t('hostPreviewTitle')}</h2>
          <p className="text-sm text-neutral-500">{locked ? t('hostProOnly') : t('hostPreviewHint')}</p>
        </div>
      </div>
      {locked ? (
        <div className="flex flex-wrap gap-2">
          <Link href="/billing" className="rounded-full bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
            {t('hostProCta')}
          </Link>
          <a href="/host?demo=1" target="_blank" rel="noreferrer" className="rounded-full border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700">
            {t('hostProDemo')}
          </a>
        </div>
      ) : (
        <DeviceFrame title={t('hostStand')} src="/host?demo=1" openHref="/host" openLabel={t('openHost')} />
      )}
    </section>
  );
}
