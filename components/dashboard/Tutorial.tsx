'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Calculator, LayoutGrid, ChevronDown, ChevronUp } from 'lucide-react';
import { DeviceFrame } from './PosPreview';

// Two guided chapters. Each is a numbered walk-through next to the real
// screen running on sample data, so a new cashier or host can try every step
// before service without touching live sales or bookings.

const POS_STEPS = ['open', 'sell', 'options', 'table', 'charge', 'customer', 'kitchen', 'close'] as const;
const HOST_STEPS = ['plan', 'lists', 'book', 'arrive', 'seat', 'status', 'waitlist', 'finish'] as const;

export function Tutorial({ showPos }: { showPos: boolean }) {
  const t = useTranslations('tutorial');
  const [open, setOpen] = useState<'pos' | 'host'>(showPos ? 'pos' : 'host');

  const chapters = [
    ...(showPos
      ? [{ key: 'pos' as const, icon: Calculator, steps: POS_STEPS, src: '/pos?demo=1', href: '/pos' }]
      : []),
    { key: 'host' as const, icon: LayoutGrid, steps: HOST_STEPS, src: '/host?demo=1', href: '/host' },
  ];

  return (
    <div className="space-y-4">
      {chapters.map(({ key, icon: Icon, steps, src, href }) => {
        const expanded = open === key;
        return (
          <section key={key} className="rounded-2xl border border-neutral-200 bg-white">
            <button onClick={() => setOpen(key)} className="flex w-full items-center gap-3 p-4 text-left">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-neutral-900 text-white">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{t(`${key}_title`)}</span>
                <span className="block text-sm text-neutral-500">{t(`${key}_intro`)}</span>
              </span>
              {expanded ? <ChevronUp className="h-5 w-5 text-neutral-400" /> : <ChevronDown className="h-5 w-5 text-neutral-400" />}
            </button>
            {expanded && (
              <div className="grid gap-6 border-t border-neutral-100 p-4 xl:grid-cols-[minmax(0,380px)_1fr]">
                <ol className="space-y-3">
                  {steps.map((s, i) => (
                    <li key={s} className="flex gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-700">{i + 1}</span>
                      <div>
                        <p className="font-semibold">{t(`${key}_${s}_t`)}</p>
                        <p className="text-sm text-neutral-500">{t(`${key}_${s}_b`)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="min-w-0">
                  <DeviceFrame title={t('tryIt')} src={src} openHref={href} openLabel={t('openReal')} />
                  <p className="mt-2 text-xs text-neutral-500">{t('demoNote')}</p>
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
