import type { TenantTheme } from '@/lib/database.types';
import { DEFAULT_MENU_SETTINGS, type MenuSettings } from '@/lib/menu-settings';

/**
 * A named look. Choosing one writes every colour, font and layout knob it lists
 * in one go, so the menu lands on a known-good design without the owner having
 * to touch twenty controls.
 *
 * Presets deliberately never touch brand *content* — logo, cover, slogan,
 * currency, background image/music, whether the name is shown. Those belong to
 * the restaurant, not to the look.
 */
export type PresetThemeFields = Partial<
  Pick<
    TenantTheme,
    | 'primary_color'
    | 'secondary_color'
    | 'background_color'
    | 'text_color'
    | 'text_secondary_color'
    | 'card_color'
    | 'border_color'
    | 'separator_color'
    | 'tab_bar_color'
    | 'tab_selected_color'
    | 'tab_unselected_color'
    | 'tab_font_color'
    | 'button_color'
    | 'button_text_color'
    | 'search_bg_color'
    | 'search_text_color'
    | 'search_border_color'
    | 'font_family'
    | 'font_category'
    | 'font_product'
    | 'font_price'
    | 'font_description'
  >
>;

export interface MenuPreset {
  id: string;
  name: string;
  /** One line describing the look, shown under the swatch. */
  blurb: { es: string; en: string };
  /** Two colours used to draw the picker swatch. */
  swatch: [string, string];
  theme: PresetThemeFields;
  settings: Partial<MenuSettings>;
}

/** Look knobs that no preset should carry (they are the tenant's own data). */
const OWNED_BY_TENANT = ['currency', 'showName', 'showSlogan'] as const;

const KUIK: MenuPreset = {
  id: 'kuik',
  name: 'Kuik',
  blurb: {
    es: 'Tarjetas con foto a la izquierda. El estilo por defecto.',
    en: 'Cards with the photo on the left. The default look.',
  },
  swatch: ['#111111', '#f5f5f5'],
  theme: {
    primary_color: '#111111',
    secondary_color: '#111111',
    background_color: '#fafafa',
    text_color: '#111111',
    text_secondary_color: '#737373',
    card_color: '#ffffff',
    border_color: '#e5e5e5',
    separator_color: '#e5e5e5',
    tab_bar_color: null,
    tab_selected_color: null,
    tab_unselected_color: null,
    tab_font_color: null,
    button_color: null,
    button_text_color: null,
    search_bg_color: null,
    search_text_color: null,
    search_border_color: null,
    font_family: 'Inter',
    font_category: null,
    font_product: null,
    font_price: null,
    font_description: null,
  },
  // Everything back to the shipped defaults.
  settings: DEFAULT_MENU_SETTINGS,
};

/**
 * Ocean — a printed seafood-restaurant menu: no cards, one narrow centred
 * column, gold section titles between hairlines, the price inline right after
 * the dish name, photos full-width above the name for the few dishes that have
 * one, and "choose your filling" options printed as a two-column chip grid.
 */
const OCEAN: MenuPreset = {
  id: 'ocean',
  name: 'Ocean',
  blurb: {
    es: 'Menú impreso: sin tarjetas, texto centrado, títulos dorados entre líneas.',
    en: 'Printed menu: no cards, centred text, gold titles between hairlines.',
  },
  swatch: ['#11426d', '#a86619'],
  theme: {
    primary_color: '#6f4c40', // price + "choose one of…" labels
    secondary_color: '#a86619', // section titles
    background_color: '#ffffff',
    text_color: '#000000',
    text_secondary_color: '#5b5b5b', // descriptions in a softer ink
    card_color: '#ffffff', // the option chips
    border_color: '#e5e5e5',
    separator_color: '#a86619', // the hairlines around section titles
    tab_bar_color: '#11426d',
    tab_selected_color: '#0b2d4b',
    tab_unselected_color: '#a1725c', // the tan icon badges on the navy bar
    tab_font_color: '#ffffff',
    button_color: '#11426d',
    button_text_color: '#ffffff',
    search_bg_color: '#ffffff',
    search_text_color: '#000000',
    search_border_color: '#e5e5e5',
    font_family: 'Asap',
    font_category: null,
    font_product: null,
    font_price: null,
    font_description: null,
  },
  settings: {
    cardStyle: 'classic',
    contentWidth: 'wide',
    itemSpacing: 'roomy', // measured off the original: 24px between dishes
    cardSurface: 'auto',
    imagePosition: 'auto',
    imageSize: 'auto',
    imageRatio: 'auto',
    itemAlign: 'auto',
    priceStyle: 'auto',
    imageShape: 'square',
    cornerRadius: 'sm',
    cardBorder: false,
    cardShadow: false,
    density: 'comfortable',
    showAddButton: false,
    categoryAlign: 'center',
    categoryRule: 'both',
    categoryCase: 'upper',
    categoryIcons: false,
    categoryTitle: 'auto',
    subcategoryRule: 'both',
    subcategorySize: 0.72,
    navIconPosition: 'top',
    navIconSize: 44,
    navTabShape: 'plain',
    navIconShape: 'circle',
    logoWideVariant: 'dark', // the bar is navy even on a light menu
    headerStyle: 'bar',
    fullWidthHeader: true,
    productCase: 'upper',
    descriptionCase: 'upper',
    showInlineOptions: true,
    inlineOptionColumns: 2,
    inlineOptionBullet: '⚓',
    navMode: 'scroll',
    stickyTabs: true,
    collapsibleCategories: false,
    showSearch: false,
    showFilters: false,
    showBadges: false,
    showSocial: true,
    whatsappBubble: true,
    soldOutStyle: 'gray',
    darkMode: 'off',
    animations: true,
    categoryBold: true,
    categoryItalic: false,
    categorySize: 1.75, // 1.25rem base → ~35px, the original's section title
    productBold: true,
    productItalic: false,
    productSize: 1.15, // ~18px
    priceBold: true,
    priceItalic: false,
    priceSize: 1, // ~16px
    descriptionBold: false,
    descriptionItalic: false,
    descriptionSize: 1, // ~14px
  },
};

/**
 * Matcha — a matcha-bar app screen: a narrow column of white cards in a
 * two-up grid, each with its photo up top, deep-green display headings, a monospace face for
 * descriptions and prices, a hairline across each card with the price on the
 * left and a soft green "add" pill on the right, and light-green tab pills on
 * a frosted strip.
 */
const MATCHA: MenuPreset = {
  id: 'matcha',
  name: 'Matcha',
  blurb: {
    es: 'Tarjetas a dos columnas con la foto arriba, verde profundo y tipografía mono.',
    en: 'Two-column cards with the photo on top, deep green and a monospace face.',
  },
  swatch: ['#163a24', '#e8f0e5'],
  theme: {
    primary_color: '#163a24', // prices, headings, the accent of everything
    secondary_color: '#4a7c59', // softer green for secondary emphasis
    background_color: '#fafafa',
    text_color: '#163a24',
    text_secondary_color: '#2d3748', // descriptions: slate, not green
    card_color: '#ffffff',
    border_color: '#eaf0e5', // the sage hairline on cards and dividers
    separator_color: '#eaf0e5',
    tab_bar_color: '#fafafa', // the frosted strip
    tab_selected_color: '#163a24',
    tab_unselected_color: '#e8f0e5',
    tab_font_color: null, // white on the dark pill, green on the light ones
    button_color: '#e8f0e5', // the "add +" pill
    button_text_color: '#163a24',
    search_bg_color: '#ffffff',
    search_text_color: '#163a24',
    search_border_color: '#eaf0e5',
    font_family: 'Inter',
    font_category: 'Outfit',
    font_product: 'Outfit',
    font_price: 'Space Mono',
    font_description: 'Space Mono',
  },
  settings: {
    cardStyle: 'grid',
    imagePosition: 'top', // grid gives the two columns; the photo crowns each card
    imageSize: 'full',
    imageRatio: 'square',
    itemAlign: 'left',
    priceStyle: 'footer',
    cardDivider: true,
    cardSurface: 'on',
    contentWidth: 'narrow',
    itemSpacing: 'normal',
    imageShape: 'rounded',
    cornerRadius: 'lg',
    cardBorder: true,
    cardShadow: false, // the original's shadow is 3% — the border carries it
    density: 'comfortable',
    showAddButton: true,
    categoryAlign: 'center',
    categoryRule: 'none',
    categoryCase: 'upper',
    categoryIcons: false,
    categoryTitle: 'always',
    subcategoryRule: 'none',
    subcategorySize: 0.72,
    navIconPosition: 'none',
    navIconSize: 18,
    navTabShape: 'pill',
    navIconShape: 'plain',
    headerStyle: 'stacked', // the centred logo / name / slogan hero
    logoWideHeight: 44,
    fullWidthHeader: false,
    productCase: 'none',
    descriptionCase: 'none',
    showInlineOptions: false,
    inlineOptionColumns: 2,
    inlineOptionBullet: '•',
    navMode: 'scroll',
    stickyTabs: true,
    collapsibleCategories: false,
    showSearch: false,
    showFilters: false,
    showBadges: false,
    showSocial: true,
    showHours: true,
    showDirections: true,
    whatsappBubble: false,
    soldOutStyle: 'gray',
    darkMode: 'off',
    animations: true,
    categoryBold: true,
    categoryItalic: false,
    categorySize: 1.2,
    productBold: true,
    productItalic: false,
    productSize: 1,
    priceBold: true,
    priceItalic: false,
    priceSize: 1,
    descriptionBold: false,
    descriptionItalic: false,
    descriptionSize: 0.8, // the original runs 9px mono; this keeps it legible
  },
};

export const MENU_PRESETS: MenuPreset[] = [KUIK, OCEAN, MATCHA];

export function getPreset(id: string): MenuPreset | undefined {
  return MENU_PRESETS.find((p) => p.id === id);
}

/** The settings a preset writes, with the tenant's own fields stripped out. */
export function presetSettings(p: MenuPreset): Partial<MenuSettings> {
  const out = { ...p.settings };
  for (const k of OWNED_BY_TENANT) delete out[k];
  return out;
}
