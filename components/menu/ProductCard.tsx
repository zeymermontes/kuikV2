'use client';

import Image from 'next/image';
import { Plus, Clock, Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Product } from '@/lib/database.types';
import { getBadge, badgeLabel } from '@/lib/badges';
import {
  IMAGE_SHAPE_CLASS,
  type CardStyle,
  type ImageShape,
  type Density,
} from '@/lib/menu-settings';
import { formatPrice } from '@/lib/utils';

export function ProductCard({
  product,
  showPrice,
  currency,
  locale,
  qty,
  orderingEnabled,
  cardStyle,
  imageShape,
  density,
  radiusClass,
  border,
  shadow,
  onOpen,
}: {
  product: Product;
  showPrice: boolean;
  currency: string;
  locale: string;
  qty: number;
  orderingEnabled: boolean;
  cardStyle: CardStyle;
  imageShape: ImageShape;
  density: Density;
  radiusClass: string;
  border: boolean;
  shadow: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations('menu');
  const dimmed = !product.is_available;
  const hasOptions =
    product.variants.length > 0 ||
    product.modifiers.length > 0 ||
    product.removables.length > 0;
  const clickable = orderingEnabled && !dimmed;
  const vertical = cardStyle === 'grid' || cardStyle === 'large';
  const showImage = cardStyle !== 'text' && Boolean(product.image_url);
  const pad = density === 'compact' ? 'p-2' : 'p-3';

  const discounted =
    product.compare_at_price != null &&
    product.price != null &&
    product.compare_at_price > product.price;

  const badges = product.tags
    .map(getBadge)
    .filter((b): b is NonNullable<typeof b> => Boolean(b));

  const wrapStyle = {
    backgroundColor: 'var(--brand-surface)',
    border: border ? '1px solid var(--brand-border)' : undefined,
    boxShadow: shadow ? '0 1px 6px rgba(0,0,0,.08)' : undefined,
  };

  const priceBlock = showPrice && product.price != null && (
    <span className="flex shrink-0 items-baseline gap-1.5">
      {discounted && (
        <span className="text-xs line-through opacity-50">
          {formatPrice(product.compare_at_price!, currency, locale)}
        </span>
      )}
      <span className="font-semibold" style={{ color: 'var(--brand-primary)', fontFamily: 'var(--font-price)' }}>
        {formatPrice(product.price, currency, locale)}
        {hasOptions && <span className="text-xs font-normal opacity-60"> +</span>}
      </span>
    </span>
  );

  const badgeRow = badges.length > 0 && (
    <div className="mb-1 flex flex-wrap gap-1">
      {badges.map((b) => (
        <span
          key={b.key}
          className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: b.color, color: b.text }}
        >
          {b.emoji} {badgeLabel(b, locale)}
        </span>
      ))}
    </div>
  );

  const meta = (product.prep_time || product.calories != null) && (
    <div className="mt-1 flex items-center gap-3 text-xs" style={{ color: 'var(--brand-text-secondary)' }}>
      {product.prep_time && (
        <span className="flex items-center gap-1">
          <Clock className="h-3 w-3" /> {product.prep_time}
        </span>
      )}
      {product.calories != null && (
        <span className="flex items-center gap-1">
          <Flame className="h-3 w-3" /> {product.calories} kcal
        </span>
      )}
    </div>
  );

  // Visual add affordance — the whole card is the click target (opens detail).
  const addControl = clickable && (
    <span
      className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold"
      style={{ backgroundColor: 'var(--brand-button)', color: 'var(--brand-button-text)' }}
    >
      <Plus className="h-4 w-4" />
      {qty > 0 ? `${qty}` : t('addToOrder')}
    </span>
  );

  // ── Vertical card (grid / large) ───────────────────────────────────────────
  if (vertical) {
    return (
      <div
        onClick={clickable ? onOpen : undefined}
        role={clickable ? 'button' : undefined}
        className={`flex flex-col overflow-hidden ${radiusClass} ${dimmed ? 'opacity-50' : ''} ${clickable ? 'cursor-pointer' : ''}`}
        style={wrapStyle}
      >
        {showImage && (
          <div className={`relative w-full ${cardStyle === 'large' ? 'aspect-video' : 'aspect-square'}`}>
            <Image src={product.image_url!} alt={product.name} fill className="object-cover" />
          </div>
        )}
        <div className={`flex flex-1 flex-col ${pad}`}>
          {badgeRow}
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold leading-tight" style={{ fontFamily: 'var(--font-product)' }}>{product.name}</h3>
            {priceBlock}
          </div>
          {product.description && (
            <p className="mt-1 text-sm line-clamp-2" style={{ color: 'var(--brand-text-secondary)', fontFamily: 'var(--font-description)' }}>{product.description}</p>
          )}
          {meta}
          <div className="mt-auto flex items-center justify-between pt-2">
            {dimmed ? (
              <span className="text-xs font-medium opacity-50">{t('unavailable')}</span>
            ) : (
              <span />
            )}
            {addControl}
          </div>
        </div>
      </div>
    );
  }

  // ── Horizontal card (list / text) ──────────────────────────────────────────
  return (
    <div
      onClick={clickable ? onOpen : undefined}
      role={clickable ? 'button' : undefined}
      className={`flex gap-3 ${radiusClass} ${pad} ${dimmed ? 'opacity-50' : ''} ${clickable ? 'cursor-pointer' : ''}`}
      style={wrapStyle}
    >
      {showImage && (
        <Image
          src={product.image_url!}
          alt={product.name}
          width={96}
          height={96}
          className={`h-24 w-24 shrink-0 object-cover ${IMAGE_SHAPE_CLASS[imageShape]}`}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {badgeRow}
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-tight" style={{ fontFamily: 'var(--font-product)' }}>{product.name}</h3>
          {priceBlock}
        </div>

        {product.description && (
          <p className="mt-1 text-sm line-clamp-3" style={{ color: 'var(--brand-text-secondary)', fontFamily: 'var(--font-description)' }}>{product.description}</p>
        )}
        {meta}

        <div className="mt-auto flex items-center justify-between pt-2">
          {dimmed ? (
            <span className="text-xs font-medium opacity-50">{t('unavailable')}</span>
          ) : (
            <span />
          )}
          {addControl}
        </div>
      </div>
    </div>
  );
}
