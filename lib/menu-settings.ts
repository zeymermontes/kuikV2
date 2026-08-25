import type { TenantTheme } from '@/lib/database.types';

// All the look-and-feel knobs that live inside tenant_theme.settings (jsonb).
// Adding a new one here requires NO database migration.

export type DarkMode = 'off' | 'on' | 'auto';
export type CardStyle = 'list' | 'grid' | 'large' | 'text' | 'classic';
export type ImageShape = 'square' | 'rounded' | 'circle' | 'full';
export type CornerRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type Density = 'comfortable' | 'compact';
export type SoldOutStyle = 'gray' | 'hide';
export type NavMode = 'scroll' | 'tabs';

// ── Atomic item-layout knobs ────────────────────────────────────────────────
// Every one of these accepts 'auto', which means "use whatever `cardStyle`
// implies". That keeps `cardStyle` a one-click starting point while still
// letting a tenant override any single aspect of it (photo above vs. below the
// name, card surface on/off, price inline vs. right-aligned…).
export type ImagePosition = 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'none';
export type ImageSize = 'auto' | 'thumb' | 'medium' | 'full';
export type ImageRatio = 'auto' | 'natural' | 'square' | 'video' | 'wide';
export type TextAlign = 'auto' | 'left' | 'center' | 'right';
export type PriceStyle = 'auto' | 'right' | 'inline' | 'dots' | 'below';
export type Surface = 'auto' | 'on' | 'off';
export type ItemSpacing = 'auto' | 'none' | 'tight' | 'normal' | 'loose' | 'roomy';

// ── Page / heading knobs ────────────────────────────────────────────────────
export type HeadingAlign = 'left' | 'center' | 'right';
export type CategoryRule = 'none' | 'under' | 'both';
export type TextCase = 'none' | 'upper';
export type ContentWidth = 'narrow' | 'normal' | 'wide' | 'full';
/**
 * When to print the section's own title in the page body.
 * 'auto' drops it for sections that have subcategories — their headings already
 * carry the page, and the tab bar still names the parent (the Mar & Sea look).
 */
export type CategoryTitleMode = 'always' | 'auto' | 'never';
/**
 * Which version of a brand image a given slot uses. 'auto' follows the menu's
 * dark mode; 'light'/'dark' pin it — a bar header is dark even on a light menu,
 * so its wordmark wants 'dark' regardless.
 */
export type ImageVariant = 'auto' | 'light' | 'dark';
export type NavIconPosition = 'left' | 'top' | 'bottom' | 'none';
export type NavTabShape = 'pill' | 'plain';
/**
 * 'stacked' — logo, name and slogan centred in the content column (default).
 * 'bar' — a full-width bar across the viewport: back on the left, logo centred,
 * reservations on the right, with the category strip below it in the same bar.
 */
export type HeaderStyle = 'stacked' | 'bar';
/** Whether a nav icon sits in a filled circle (like a printed menu's badges). */
export type NavIconShape = 'plain' | 'circle';

export interface MenuSettings {
  currency: string;
  showName: boolean;
  showSlogan: boolean;
  logoVariant: ImageVariant;
  logoWideVariant: ImageVariant;
  faviconVariant: ImageVariant;
  coverVariant: ImageVariant;
  darkMode: DarkMode;
  cardStyle: CardStyle;
  imageShape: ImageShape;
  cornerRadius: CornerRadius;
  cardBorder: boolean;
  cardShadow: boolean;
  density: Density;
  animations: boolean;
  navMode: NavMode;
  stickyTabs: boolean;
  collapsibleCategories: boolean;
  showSearch: boolean;
  showFilters: boolean;
  showBadges: boolean;
  soldOutStyle: SoldOutStyle;
  showSocial: boolean;
  // Page frame.
  contentWidth: ContentWidth;
  itemSpacing: ItemSpacing;
  // Item layout overrides (all default to 'auto' = follow `cardStyle`).
  cardSurface: Surface;
  imagePosition: ImagePosition;
  imageSize: ImageSize;
  imageRatio: ImageRatio;
  itemAlign: TextAlign;
  priceStyle: PriceStyle;
  showAddButton: boolean;
  // Category headings.
  categoryAlign: HeadingAlign;
  categoryRule: CategoryRule;
  categoryCase: TextCase;
  categoryIcons: boolean;
  /** The section title inside the page (the tab bar may already name it). */
  categoryTitle: CategoryTitleMode;
  subcategoryRule: CategoryRule;
  /** Subcategory heading size, as a fraction of the category heading. */
  subcategorySize: number;
  // Category tab bar.
  navIconPosition: NavIconPosition;
  navIconSize: number;
  navTabShape: NavTabShape;
  navIconShape: NavIconShape;
  headerStyle: HeaderStyle;
  /** Height of the wordmark in the bar header, in px. */
  logoWideHeight: number;
  /** The bar and the category strip span the viewport, not the content column. */
  fullWidthHeader: boolean;
  // Product typography casing.
  productCase: TextCase;
  descriptionCase: TextCase;
  // Options printed under the product (printed-menu style "choose one of…").
  showInlineOptions: boolean;
  inlineOptionColumns: number;
  inlineOptionBullet: string;
  // Per-element typography (bold / italic / size multiplier).
  categoryBold: boolean;
  categoryItalic: boolean;
  categorySize: number;
  productBold: boolean;
  productItalic: boolean;
  productSize: number;
  priceBold: boolean;
  priceItalic: boolean;
  priceSize: number;
  descriptionBold: boolean;
  descriptionItalic: boolean;
  descriptionSize: number;
}

export const DEFAULT_MENU_SETTINGS: MenuSettings = {
  currency: 'MXN',
  showName: true,
  showSlogan: true,
  logoVariant: 'auto',
  logoWideVariant: 'auto',
  faviconVariant: 'auto',
  coverVariant: 'auto',
  darkMode: 'off',
  cardStyle: 'list',
  imageShape: 'rounded',
  cornerRadius: 'lg',
  cardBorder: false,
  cardShadow: true,
  density: 'comfortable',
  animations: true,
  navMode: 'scroll',
  stickyTabs: true,
  collapsibleCategories: false,
  showSearch: false,
  showFilters: false,
  showBadges: true,
  soldOutStyle: 'gray',
  showSocial: true,
  contentWidth: 'normal',
  itemSpacing: 'auto',
  cardSurface: 'auto',
  imagePosition: 'auto',
  imageSize: 'auto',
  imageRatio: 'auto',
  itemAlign: 'auto',
  priceStyle: 'auto',
  showAddButton: true,
  categoryAlign: 'left',
  categoryRule: 'none',
  categoryCase: 'none',
  categoryIcons: true,
  categoryTitle: 'always',
  subcategoryRule: 'none',
  subcategorySize: 0.72,
  navIconPosition: 'left',
  navIconSize: 18,
  navTabShape: 'pill',
  navIconShape: 'plain',
  headerStyle: 'stacked',
  logoWideHeight: 44,
  fullWidthHeader: false,
  productCase: 'none',
  descriptionCase: 'none',
  showInlineOptions: false,
  inlineOptionColumns: 2,
  inlineOptionBullet: '•',
  categoryBold: true,
  categoryItalic: false,
  categorySize: 1,
  productBold: true,
  productItalic: false,
  productSize: 1,
  priceBold: true,
  priceItalic: false,
  priceSize: 1,
  descriptionBold: false,
  descriptionItalic: false,
  descriptionSize: 1,
};

/** Merge a tenant's stored settings over the defaults, ignoring unknown keys. */
export function resolveMenuSettings(
  raw: TenantTheme['settings'] | null | undefined,
): MenuSettings {
  return { ...DEFAULT_MENU_SETTINGS, ...(raw ?? {}) } as MenuSettings;
}

// Tailwind radius classes keyed by the cornerRadius setting.
export const RADIUS_CLASS: Record<CornerRadius, string> = {
  none: 'rounded-none',
  sm: 'rounded-md',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
  xl: 'rounded-3xl',
};

export const IMAGE_SHAPE_CLASS: Record<ImageShape, string> = {
  square: 'rounded-none',
  rounded: 'rounded-xl',
  circle: 'rounded-full',
  full: 'rounded-xl', // "full" = full-width image, handled by layout not this class
};

// ── Resolved item layout ────────────────────────────────────────────────────

/** The fully-resolved shape of one product row, with every 'auto' settled. */
export interface ItemLayout {
  surface: boolean; // draw the card background / border / shadow
  image: Exclude<ImagePosition, 'auto'>;
  imageSize: Exclude<ImageSize, 'auto'>;
  imageRatio: Exclude<ImageRatio, 'auto'>;
  align: Exclude<TextAlign, 'auto'>;
  price: Exclude<PriceStyle, 'auto'>;
  columns: 1 | 2;
  gap: string; // CSS length between items
}

type LayoutBase = Omit<ItemLayout, 'gap'> & { gap: Exclude<ItemSpacing, 'auto'> };

/** What each `cardStyle` means, before any per-knob override. */
const CARD_STYLE_BASE: Record<CardStyle, LayoutBase> = {
  list: { surface: true, image: 'left', imageSize: 'thumb', imageRatio: 'square', align: 'left', price: 'right', columns: 1, gap: 'normal' },
  grid: { surface: true, image: 'top', imageSize: 'full', imageRatio: 'square', align: 'left', price: 'right', columns: 2, gap: 'normal' },
  large: { surface: true, image: 'top', imageSize: 'full', imageRatio: 'video', align: 'left', price: 'right', columns: 1, gap: 'loose' },
  text: { surface: true, image: 'none', imageSize: 'thumb', imageRatio: 'square', align: 'left', price: 'right', columns: 1, gap: 'normal' },
  // "classic" — a printed menu: no cards, centered, photo above the name.
  classic: { surface: false, image: 'top', imageSize: 'full', imageRatio: 'natural', align: 'center', price: 'inline', columns: 1, gap: 'tight' },
};

export const ITEM_GAP: Record<Exclude<ItemSpacing, 'auto'>, string> = {
  none: '0rem',
  tight: '0.375rem',
  normal: '0.75rem',
  loose: '1rem',
  roomy: '1.5rem', // what a printed menu leaves between dishes
};

/** Settle every 'auto' knob against the chosen `cardStyle`. */
export function resolveItemLayout(s: MenuSettings): ItemLayout {
  const base = CARD_STYLE_BASE[s.cardStyle] ?? CARD_STYLE_BASE.list;
  return {
    surface: s.cardSurface === 'auto' ? base.surface : s.cardSurface === 'on',
    image: s.imagePosition === 'auto' ? base.image : s.imagePosition,
    imageSize: s.imageSize === 'auto' ? base.imageSize : s.imageSize,
    imageRatio: s.imageRatio === 'auto' ? base.imageRatio : s.imageRatio,
    align: s.itemAlign === 'auto' ? base.align : s.itemAlign,
    price: s.priceStyle === 'auto' ? base.price : s.priceStyle,
    columns: base.columns,
    gap: ITEM_GAP[s.itemSpacing === 'auto' ? base.gap : s.itemSpacing],
  };
}

/** Max width of the menu column. */
export const CONTENT_WIDTH_CLASS: Record<ContentWidth, string> = {
  narrow: 'max-w-lg',
  normal: 'max-w-2xl',
  wide: 'max-w-3xl',
  full: 'max-w-5xl',
};

/** Fixed pixel size of a thumbnail image (used for left/right placement). */
export const THUMB_PX: Record<Exclude<ImageSize, 'auto' | 'full'>, number> = {
  thumb: 96,
  medium: 128,
};

export const RATIO_CLASS: Record<Exclude<ImageRatio, 'auto' | 'natural'>, string> = {
  square: 'aspect-square',
  video: 'aspect-video',
  wide: 'aspect-[21/9]',
};

export const ALIGN_CLASS: Record<HeadingAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

export const ITEMS_CLASS: Record<HeadingAlign, string> = {
  left: 'items-start',
  center: 'items-center',
  right: 'items-end',
};

export const JUSTIFY_CLASS: Record<HeadingAlign, string> = {
  left: 'justify-start',
  center: 'justify-center',
  right: 'justify-end',
};

export function textTransform(c: TextCase): 'none' | 'uppercase' {
  return c === 'upper' ? 'uppercase' : 'none';
}

/**
 * Pick the light or dark file for one slot. `dark` is what the page itself is
 * doing; a slot can override it. Falls back to the light file, then to null.
 */
export function pickImage(
  light: string | null,
  darkImage: string | null,
  variant: ImageVariant,
  pageIsDark: boolean,
): string | null {
  const wantDark = variant === 'dark' || (variant === 'auto' && pageIsDark);
  return (wantDark ? darkImage ?? light : light) ?? null;
}

/** Whether to print a section's own title, given how many subcategories it has. */
export function showCategoryTitle(mode: CategoryTitleMode, subCount: number): boolean {
  if (mode === 'never') return false;
  if (mode === 'auto') return subCount === 0;
  return true;
}
