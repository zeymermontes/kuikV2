'use client';

import Image from 'next/image';
import { Plus, Clock, Flame } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Product } from '@/lib/database.types';
import { getBadge, badgeLabel } from '@/lib/badges';
import { hasOptions } from '@/lib/menu-options';
import {
  IMAGE_SHAPE_CLASS,
  RATIO_CLASS,
  THUMB_PX,
  ALIGN_CLASS,
  ITEMS_CLASS,
  JUSTIFY_CLASS,
  textTransform,
  type ItemLayout,
  type MenuSettings,
} from '@/lib/menu-settings';
import { formatPrice } from '@/lib/utils';
import { InlineOptions } from './InlineOptions';

export function ProductCard({
  product,
  showPrice,
  currency,
  locale,
  qty,
  orderingEnabled,
  openable = true,
  layout,
  settings,
  radiusClass,
  onOpen,
  id,
}: {
  product: Product;
  showPrice: boolean;
  currency: string;
  locale: string;
  qty: number;
  orderingEnabled: boolean;
  /** Tapping opens the detail sheet even when ordering is off (showcase mode). */
  openable?: boolean;
  layout: ItemLayout;
  settings: MenuSettings;
  radiusClass: string;
  onOpen: () => void;
  id?: string;
}) {
  const t = useTranslations('menu');
  const dimmed = !product.is_available;
  const optioned = hasOptions(product);
  const clickable = openable && !dimmed;
  const canOrder = orderingEnabled && !dimmed;
  const align = layout.align;
  const showImage = layout.image !== 'none' && Boolean(product.image_url);
  const beside = showImage && (layout.image === 'left' || layout.image === 'right');
  const pad = settings.density === 'compact' ? 'p-2' : 'p-3';

  // A full-bleed image on a card sits flush against the card edges, so the
  // padding moves inside and the card clips the corners.
  const flush = showImage && !beside && layout.imageSize === 'full' && layout.surface;

  const discounted =
    product.compare_at_price != null &&
    product.price != null &&
    product.compare_at_price > product.price;

  const badges = settings.showBadges
    ? product.tags.map(getBadge).filter((b): b is NonNullable<typeof b> => Boolean(b))
    : [];

  const wrapStyle = {
    backgroundColor: layout.surface ? 'var(--brand-surface)' : undefined,
    border: layout.surface && settings.cardBorder ? '1px solid var(--brand-border)' : undefined,
    boxShadow: layout.surface && settings.cardShadow ? '0 1px 6px rgba(0,0,0,.08)' : undefined,
  };

  // ── Image ─────────────────────────────────────────────────────────────────
  let imageEl: React.ReactNode = null;
  if (showImage) {
    if (beside) {
      const px = THUMB_PX[layout.imageSize === 'full' ? 'medium' : layout.imageSize];
      imageEl = (
        <Image
          src={product.image_url!}
          alt={product.name}
          width={px}
          height={px}
          className={`shrink-0 object-cover ${IMAGE_SHAPE_CLASS[settings.imageShape]}`}
          style={{ width: px, height: px }}
        />
      );
    } else {
      const widthPct =
        layout.imageSize === 'full' ? '100%' : layout.imageSize === 'medium' ? '66.666%' : '33.333%';
      const blockWidth =
        layout.imageSize === 'full' ? 'w-full' : layout.imageSize === 'medium' ? 'w-2/3' : 'w-1/3';
      const rounding = flush ? '' : IMAGE_SHAPE_CLASS[settings.imageShape];
      const centered = align === 'center' ? 'mx-auto' : align === 'right' ? 'ml-auto' : '';
      const maxH = settings.imageMaxHeight;
      imageEl =
        layout.imageRatio === 'natural' ? (
          // Natural ratio: the browser derives the height from the file, so a
          // portrait shot is bounded by height and its width follows. Capping
          // width instead would stretch a tall photo down the whole page.
          <Image
            src={product.image_url!}
            alt={product.name}
            width={1200}
            height={800}
            sizes="(max-width: 768px) 100vw, 768px"
            className={`h-auto ${centered} ${rounding} object-contain`}
            style={{ maxHeight: maxH, width: 'auto', maxWidth: widthPct }}
          />
        ) : (
          <div
            className={`relative ${blockWidth} ${centered} ${rounding} ${flush ? '' : 'overflow-hidden'} ${RATIO_CLASS[layout.imageRatio]}`}
            style={{ maxHeight: maxH }}
          >
            <Image
              src={product.image_url!}
              alt={product.name}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          </div>
        );
    }
  }

  // ── Text pieces ───────────────────────────────────────────────────────────
  const priceValue = showPrice && product.price != null && (
    <>
      {discounted && (
        <span className="mr-1.5 text-xs line-through opacity-50">
          {formatPrice(product.compare_at_price!, currency, locale)}
        </span>
      )}
      <span
        style={{
          color: 'var(--brand-primary)',
          fontFamily: 'var(--font-price)',
          fontSize: 'var(--fs-price)',
          fontWeight: 'var(--fw-price)',
          fontStyle: 'var(--fst-price)',
        }}
      >
        {formatPrice(product.price!, currency, locale)}
        {optioned && <span className="text-xs font-normal opacity-60"> +</span>}
      </span>
    </>
  );

  const nameEl = (
    <h3
      className="leading-tight"
      style={{
        fontFamily: 'var(--font-product)',
        fontSize: 'var(--fs-product)',
        fontWeight: 'var(--fw-product)',
        fontStyle: 'var(--fst-product)',
        textTransform: textTransform(settings.productCase),
      }}
    >
      {product.name}
      {/* 'inline' prints the price in the same run of text as the name. */}
      {layout.price === 'inline' && priceValue && <span className="ml-2">{priceValue}</span>}
    </h3>
  );

  let titleRow: React.ReactNode;
  if (layout.price === 'inline' || layout.price === 'footer' || !priceValue) {
    titleRow = nameEl;
  } else if (layout.price === 'below') {
    titleRow = (
      <>
        {nameEl}
        <span className="mt-0.5 block">{priceValue}</span>
      </>
    );
  } else if (layout.price === 'dots') {
    titleRow = (
      <div className="flex w-full items-baseline gap-2">
        <span className="shrink-0">{nameEl}</span>
        <span
          className="min-w-4 flex-1 translate-y-[-3px] border-b border-dotted opacity-40"
          style={{ borderColor: 'var(--brand-text-secondary)' }}
          aria-hidden
        />
        <span className="shrink-0">{priceValue}</span>
      </div>
    );
  } else {
    // 'right' — name on the left, price pushed to the far edge.
    titleRow = (
      <div className="flex w-full items-start justify-between gap-2">
        {nameEl}
        <span className="flex shrink-0 items-baseline">{priceValue}</span>
      </div>
    );
  }

  const badgeRow = badges.length > 0 && (
    <div className={`mb-1 flex flex-wrap gap-1 ${JUSTIFY_CLASS[align]}`}>
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
    <div
      className={`mt-1 flex items-center gap-3 text-xs ${JUSTIFY_CLASS[align]}`}
      style={{ color: 'var(--brand-text-secondary)' }}
    >
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
  const addControl = canOrder && settings.showAddButton && (
    <span
      className="flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-semibold"
      style={{ backgroundColor: 'var(--brand-button)', color: 'var(--brand-button-text)' }}
    >
      <Plus className="h-4 w-4" />
      {qty > 0 ? `${qty}` : t('addToOrder')}
    </span>
  );

  const soldOut = dimmed && (
    <span className="text-xs font-medium opacity-50">{t('unavailable')}</span>
  );

  // 'footer' moves the price down here, beside the add control — the printed
  // "price left, action right" row a divider can sit above.
  const footerPrice = layout.price === 'footer' ? priceValue : null;
  const twoSided = Boolean(footerPrice || soldOut) && Boolean(addControl);
  const footer = (soldOut || addControl || footerPrice) && (
    <div
      className={`mt-auto flex flex-wrap items-center gap-2 ${
        settings.cardDivider ? 'border-t pt-3' : 'pt-2'
      } ${twoSided ? 'justify-between' : JUSTIFY_CLASS[align]}`}
      style={settings.cardDivider ? { borderColor: 'var(--brand-border)' } : undefined}
    >
      {footerPrice}
      {soldOut}
      {addControl}
    </div>
  );

  const body = (
    <div className={`flex min-w-0 flex-1 flex-col ${ALIGN_CLASS[align]} ${ITEMS_CLASS[align]}`}>
      {badgeRow}
      {titleRow}
      {product.description && (
        <p
          className={`mt-1 whitespace-pre-line ${beside ? 'line-clamp-3' : ''}`}
          style={{
            color: 'var(--brand-text-secondary)',
            fontFamily: 'var(--font-description)',
            fontSize: 'var(--fs-description)',
            fontWeight: 'var(--fw-description)',
            fontStyle: 'var(--fst-description)',
            textTransform: textTransform(settings.descriptionCase),
          }}
        >
          {product.description}
        </p>
      )}
      {meta}
      {settings.showInlineOptions && (
        <InlineOptions
          product={product}
          align={align}
          columns={settings.inlineOptionColumns}
          bullet={settings.inlineOptionBullet}
          currency={currency}
          locale={locale}
          showPrice={showPrice}
          radiusClass={radiusClass}
          textCase={settings.descriptionCase}
        />
      )}
      {footer}
    </div>
  );

  const rootClass = [
    settings.animations ? 'animate-fade' : '',
    'flex',
    beside ? (layout.image === 'right' ? 'flex-row-reverse gap-3' : 'gap-3') : 'flex-col',
    radiusClass,
    flush ? 'overflow-hidden' : '',
    layout.surface && !flush ? pad : '',
    !beside && !layout.surface && layout.image === 'top' ? 'gap-2' : '',
    !beside && !layout.surface && layout.image === 'bottom' ? 'gap-2' : '',
    dimmed ? 'opacity-50' : '',
    clickable ? 'cursor-pointer' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      id={id}
      onClick={clickable ? onOpen : undefined}
      role={clickable ? 'button' : undefined}
      className={rootClass}
      style={wrapStyle}
    >
      {(layout.image === 'top' || beside) && imageEl}
      {flush ? <div className={`flex flex-1 flex-col ${pad}`}>{body}</div> : body}
      {layout.image === 'bottom' && imageEl}
    </div>
  );
}
