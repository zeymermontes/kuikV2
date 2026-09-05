'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { Check, Maximize2, UtensilsCrossed } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import { IDLE_STATE, useDisplaySubscriber, type DisplayBrand, type DisplayState } from '@/lib/pos/customer-screen';

/**
 * The second screen: what the guest sees while the cashier builds the sale.
 * Landscape splits brand | running order; portrait stacks them. It only
 * listens — every number on it comes from the terminal over the channel.
 */
export function CustomerDisplay({
  scope,
  brand: initialBrand,
  themeStyle,
}: {
  scope: string;
  brand: DisplayBrand;
  /** Brand colours as CSS variables (lib/pos/theme.ts). */
  themeStyle?: React.CSSProperties;
}) {
  const t = useTranslations('pos');
  const [state, setState] = useState<DisplayState>(IDLE_STATE);
  const [brand, setBrand] = useState(initialBrand);
  const [fullscreen, setFullscreen] = useState(false);

  useDisplaySubscriber(scope, (s, b) => {
    setBrand(b);
    // The cashier closing the receipt sends idle at once; the thank-you stays up a moment first.
    setState((cur) => (cur.phase === 'paid' && s.phase === 'idle' && Date.now() - cur.at < 8000 ? cur : s));
  });

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // Paid stays up long enough to read, then the screen returns to idle even
  // if the cashier keeps the receipt screen open.
  useEffect(() => {
    if (state.phase !== 'paid') return;
    const id = setTimeout(() => setState((s) => (s.phase === 'paid' ? { ...IDLE_STATE, at: Date.now() } : s)), 12000);
    return () => clearTimeout(id);
  }, [state.phase, state.at]);

  const money = (n: number) => formatPrice(n, brand.currency, brand.locale);
  const count = state.lines.reduce((s, l) => s + l.qty, 0);
  const idle = state.phase === 'idle' || (state.phase === 'sale' && state.lines.length === 0);

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-pos-dark text-white landscape:flex-row" style={themeStyle}>
      {/* Brand panel */}
      <aside className="relative flex shrink-0 flex-col items-center justify-center gap-4 bg-pos-accent p-8 text-center text-pos-accent-text landscape:h-full landscape:w-[38%] landscape:p-10">
        {brand.logoUrl ? (
          <Image src={brand.logoUrl} alt={brand.name} width={160} height={160} className="h-24 w-24 rounded-3xl bg-white object-cover shadow-lg landscape:h-36 landscape:w-36" />
        ) : (
          <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-white/15 landscape:h-36 landscape:w-36">
            <UtensilsCrossed className="h-12 w-12" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight landscape:text-4xl">{brand.name}</h1>
          {brand.slogan && <p className="mt-1 text-sm text-white/75 landscape:text-lg">{brand.slogan}</p>}
        </div>
        {!fullscreen && (
          <button
            onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}
            className="absolute right-3 top-3 rounded-full bg-black/20 p-2 text-white/80 hover:bg-black/30"
            aria-label={t('fullscreen')}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
      </aside>

      {/* Order panel */}
      <main className="flex min-h-0 flex-1 flex-col">
        {state.phase === 'paid' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-green-500 text-white shadow-lg animate-pop">
              <Check className="h-12 w-12" strokeWidth={3} />
            </div>
            <h2 className="text-3xl font-extrabold landscape:text-5xl">{t('thanks')}</h2>
            <p className="text-lg text-neutral-300">{t('paidSubtitle', { x: money(state.total) })}</p>
            {state.change != null && state.change > 0 && (
              <div className="mt-4 rounded-3xl bg-white/10 px-8 py-5">
                <p className="text-sm uppercase tracking-widest text-neutral-400">{t('changeDue')}</p>
                <p className="text-4xl font-extrabold landscape:text-6xl">{money(state.change)}</p>
              </div>
            )}
          </div>
        ) : idle ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-3xl font-extrabold landscape:text-5xl">{t('welcome')}</p>
            <p className="text-lg text-neutral-400">{t('waitingOrder')}</p>
          </div>
        ) : (
          <>
            <header className="flex items-center justify-between border-b border-white/10 px-6 py-4 landscape:px-10">
              <div>
                <p className="text-xs uppercase tracking-widest text-neutral-400">{t('yourOrder')}</p>
                <p className="text-lg font-semibold">
                  {state.label ? `${t('tableShort')} ${state.label} · ` : ''}
                  {t('items', { n: count })}
                </p>
              </div>
              {state.phase === 'paying' && (
                <span className="rounded-full bg-amber-400/20 px-3 py-1 text-sm font-semibold text-amber-300">{t('paying')}</span>
              )}
            </header>

            <ul className="min-h-0 flex-1 overflow-y-auto px-6 py-2 landscape:px-10">
              {state.lines.map((l) => (
                <li key={l.id} className="flex items-center gap-4 border-b border-white/5 py-3">
                  <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/10">
                    {l.image ? (
                      <Image src={l.image} alt={l.name} fill sizes="56px" className="object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-white/30">
                        <UtensilsCrossed className="h-6 w-6" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-medium">
                      <span className="mr-2 text-neutral-400">{l.qty}×</span>
                      {l.name}
                    </p>
                    {l.options && <p className="truncate text-sm text-neutral-400">{l.options}</p>}
                  </div>
                  <span className="text-lg font-semibold tabular-nums">{money(l.total)}</span>
                </li>
              ))}
            </ul>

            <footer className="border-t border-white/10 px-6 py-5 landscape:px-10">
              <div className="space-y-1 text-neutral-300">
                <Row label={t('subtotal')} value={money(state.subtotal)} />
                {state.discount > 0 && <Row label={t('discount')} value={`− ${money(state.discount)}`} accent />}
                {state.tip > 0 && <Row label={t('tip')} value={money(state.tip)} />}
                {state.paid != null && state.paid > 0 && <Row label={t('paidLabel')} value={`− ${money(state.paid)}`} />}
              </div>
              <div className="mt-3 flex items-end justify-between">
                <span className="text-xl font-semibold">{state.phase === 'paying' ? t('totalToPay') : t('total')}</span>
                <span className="text-4xl font-extrabold tabular-nums landscape:text-5xl">
                  {money(state.phase === 'paying' && state.due != null ? state.due : state.total)}
                </span>
              </div>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`flex justify-between text-base ${accent ? 'text-green-400' : ''}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
