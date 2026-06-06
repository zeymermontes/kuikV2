import type { TenantTheme } from '@/lib/database.types';

// All the look-and-feel knobs that live inside tenant_theme.settings (jsonb).
// Adding a new one here requires NO database migration.

export type DarkMode = 'off' | 'on' | 'auto';
export type CardStyle = 'list' | 'grid' | 'large' | 'text';
export type ImageShape = 'square' | 'rounded' | 'circle' | 'full';
export type CornerRadius = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export type Density = 'comfortable' | 'compact';
export type SoldOutStyle = 'gray' | 'hide';
export type NavMode = 'scroll' | 'tabs';

export interface MenuSettings {
  currency: string;
  showName: boolean;
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
