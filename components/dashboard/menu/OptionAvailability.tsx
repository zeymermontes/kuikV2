'use client';

import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, ChevronUp, Loader2, Search } from 'lucide-react';
import type { Product } from '@/lib/database.types';
import { listOptionNames } from '@/lib/menu-options';
import { setOptionAvailability } from '@/app/(dashboard)/menu/actions';

/**
 * Every option the menu offers ("Leche de avena", "Sin cebolla"), with a
 * switch that marks it run out or back in every product at once. Shown to
 * managers on the editor and to waiters on their availability screen.
 */
export function OptionAvailability({ products }: { products: Product[] }) {
  const t = useTranslations('menuEditor');
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();
  const [busyName, setBusyName] = useState<string | null>(null);
  const names = useMemo(() => listOptionNames(products), [products]);
  const out = names.filter((n) => !n.available);
  const shown = q ? names.filter((n) => n.name.toLowerCase().includes(q.toLowerCase())) : names;

  if (names.length === 0) return null;

  return (
    <div className="mb-5 rounded-2xl border border-neutral-200 bg-white">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left">
        <span>
          <span className="font-semibold">{t('optionsPanel')}</span>
          <span className="ml-2 text-sm text-neutral-500">
            {out.length > 0 ? t('optionsOut', { n: out.length, names: out.map((o) => o.name).join(', ') }) : t('optionsAllIn')}
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-neutral-400" /> : <ChevronDown className="h-4 w-4 text-neutral-400" />}
      </button>
      {open && (
        <div className="border-t border-neutral-100 p-4">
          <p className="mb-3 text-sm text-neutral-500">{t('optionsPanelHint')}</p>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('optionsSearch')} className="w-full rounded-xl border border-neutral-200 py-2 pl-9 pr-3 text-sm focus:border-neutral-400 focus:outline-none" />
          </div>
          <ul className="max-h-72 divide-y divide-neutral-100 overflow-y-auto">
            {shown.map((o) => (
              <li key={o.name} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className={`text-sm font-medium ${o.available ? '' : 'text-red-700 line-through'}`}>{o.name}</span>
                  <span className="block text-xs text-neutral-400">{t('optionsInProducts', { n: o.count })}</span>
                </span>
                <button
                  disabled={pending}
                  aria-busy={pending && busyName === o.name}
                  onClick={() => {
                    setBusyName(o.name);
                    start(async () => {
                      await setOptionAvailability(o.name, !o.available);
                      setBusyName(null);
                    });
                  }}
                  className={`inline-flex min-w-[5.5rem] items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${o.available ? 'bg-neutral-100 text-neutral-700 hover:bg-red-100 hover:text-red-700' : 'bg-red-600 text-white hover:bg-green-600'}`}
                >
                  {pending && busyName === o.name ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('optionSaving')}
                    </>
                  ) : o.available ? (
                    t('optionMarkOut')
                  ) : (
                    t('optionMarkIn')
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
