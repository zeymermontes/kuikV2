'use client';

import type { Product } from '@/lib/database.types';
import { useTranslations } from 'next-intl';
import { resolveOptionGroups, optionKind } from '@/lib/menu-options';
import { formatPrice } from '@/lib/utils';
import { ALIGN_CLASS, textTransform, type HeadingAlign, type TextCase } from '@/lib/menu-settings';

/**
 * The option groups of a product printed straight into the menu, the way a
 * paper menu lists "PROTEÍNA A SU ELECCIÓN" under a dish. Display only — the
 * customer still picks in the product sheet when ordering is on.
 */
export function InlineOptions({
  product,
  align,
  columns,
  bullet,
  currency,
  locale,
  showPrice,
  radiusClass,
  textCase,
}: {
  product: Product;
  align: HeadingAlign;
  columns: number;
  bullet: string;
  currency: string;
  locale: string;
  showPrice: boolean;
  radiusClass: string;
  textCase: TextCase;
}) {
  const t = useTranslations('menu');
  const groups = resolveOptionGroups(product);
  if (groups.length === 0) return null;

  // Centered layouts keep the chip grid narrower than the text, like the
  // printed original; left/right layouts use the full width.
  const widthClass = align === 'center' ? 'mx-auto w-full sm:w-1/2' : 'w-full';

  return (
    <div className="mt-3 w-full self-stretch space-y-2.5">
      {groups.map((g) => (
        <div key={g.id}>
          <span
            className={`block text-[15px] font-bold ${ALIGN_CLASS[align]}`}
            style={{ color: 'var(--brand-primary)', textTransform: textTransform(textCase) }}
          >
            {g.name}
            <span className="ml-1.5 text-[11px] font-normal opacity-60">
              {t(optionKind(g) === 'takeaway' ? 'optionsTakeaway' : 'optionsDish')}
            </span>
          </span>
          <div
            className={`mt-1.5 grid gap-1.5 ${widthClass}`}
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {g.options.map((o, i) => (
              <span
                key={`${g.id}-${i}`}
                className={`px-2.5 py-1.5 text-left text-[15px] leading-snug ${radiusClass}`}
                style={{
                  backgroundColor: 'var(--brand-surface)',
                  color: 'var(--brand-text)',
                  textTransform: textTransform(textCase),
                }}
              >
                {bullet ? `${bullet} ` : ''}
                {o.name}
                {showPrice && o.price > 0 && (
                  <span className="opacity-60"> +{formatPrice(o.price, currency, locale)}</span>
                )}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
