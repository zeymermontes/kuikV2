'use client';

import { useState } from 'react';
import { formatPrice } from '@/lib/utils';

const DEFAULT_DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

/** Count cash by denomination; reports the running total to the parent. */
export function DenomCount({
  onTotal,
  currency,
  locale,
  denoms = DEFAULT_DENOMS,
}: {
  onTotal: (total: number) => void;
  currency: string;
  locale: string;
  denoms?: number[];
}) {
  const [counts, setCounts] = useState<Record<number, number>>({});
  const total = denoms.reduce((s, d) => s + d * (counts[d] || 0), 0);

  function set(d: number, n: number) {
    const next = { ...counts, [d]: Math.max(0, n) };
    setCounts(next);
    onTotal(denoms.reduce((s, x) => s + x * (next[x] || 0), 0));
  }

  return (
    <div>
      <div className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
        {denoms.map((d) => (
          <div key={d} className="flex items-center gap-2">
            <span className="w-20 text-sm text-neutral-500">{formatPrice(d, currency, locale)}</span>
            <span className="text-neutral-300">×</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={counts[d] || ''}
              onChange={(e) => set(d, Number(e.target.value) || 0)}
              placeholder="0"
              className="w-20 rounded-lg border border-neutral-200 px-2 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
            />
            <span className="ml-auto text-sm text-neutral-400">{formatPrice(d * (counts[d] || 0), currency, locale)}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 font-bold">
        <span>Total</span>
        <span>{formatPrice(total, currency, locale)}</span>
      </div>
    </div>
  );
}
