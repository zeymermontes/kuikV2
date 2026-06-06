import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';
import { getTranslations } from 'next-intl/server';

/** Shown in place of a Pro-only feature when the tenant is on the Basic plan. */
export async function ProUpsell({ feature }: { feature: string }) {
  const t = await getTranslations('pro');
  return (
    <div className="max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center">
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-amber-50">
        <Lock className="h-5 w-5 text-amber-500" />
      </div>
      <h2 className="font-semibold">{t('locked', { feature })}</h2>
      <p className="mt-1 text-sm text-neutral-500">{t('lockedHint')}</p>
      <Link
        href="/billing"
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"
      >
        <Sparkles className="h-4 w-4" /> {t('upgrade')}
      </Link>
    </div>
  );
}
