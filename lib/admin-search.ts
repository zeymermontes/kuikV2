// What the admin-wide search (⌘K) can jump to besides pages: settings on the
// forms that support ?q=<label> deep links (Design, Ordering, Contact). Each
// entry is an i18n key under its namespace; the label is resolved at render
// time so the search speaks the user's language.

export interface SettingIndexEntry {
  /** Page the setting lives on; the search appends ?q=<label>. */
  href: '/design' | '/ordering' | '/contact';
  /** i18n namespace of the label. */
  ns: 'design' | 'ordering' | 'contact';
  /** nav.* key naming the page, shown as the result's section. */
  page: 'design' | 'ordering' | 'contact';
  keys: readonly string[];
}

export const SETTINGS_INDEX: readonly SettingIndexEntry[] = [
  { href: '/design', ns: 'design', page: 'design', keys: ['logo', 'logoWide', 'favicon', 'cover', 'showName', 'showSlogan', 'slogan', 'darkMode', 'mainFont', 'customFont', 'fontCategory', 'fontProduct', 'fontPrice', 'fontDescription', 'headerStyle', 'fullWidthHeader', 'showHours', 'showDirections', 'showSocial', 'navMode', 'stickyTabs', 'collapsible', 'navIconPosition', 'navIconSize', 'navIconShape', 'navTabShape', 'navInactiveOpacity', 'navActiveOpacity', 'navPerCategory', 'categoryAlign', 'categoryRule', 'categoryCase', 'categoryIcons', 'categoryTitle', 'subcategoryRule', 'cardStyle', 'forceTwoColumns', 'contentWidth', 'cardSurface', 'itemAlign', 'priceStyle', 'itemSpacing', 'cornerRadius', 'density', 'cardBorder', 'cardShadow', 'cardDivider', 'animations', 'showAddButton', 'showOptionKind', 'productCase', 'descriptionCase', 'showImages', 'imagePosition', 'imageSize', 'imageRatio', 'imageMaxHeight', 'imageShape', 'showInlineOptions', 'inlineOptionColumns', 'inlineOptionBullet', 'showPricesGlobal', 'showSearch', 'showBadges', 'showFilters', 'whatsappBubble', 'soldOut', 'backgroundImage', 'backgroundMusic', 'presets', 'brand', 'colors', 'font', 'header', 'navBar', 'sections', 'layout', 'photos', 'inlineOptions', 'discovery', 'ambience', 'primary', 'secondary', 'background', 'card', 'border', 'separator', 'text', 'textSecondary', 'button', 'buttonText', 'tabBar', 'tabSelected', 'tabUnselected', 'tabFont', 'searchBg', 'searchText', 'searchBorder'] },
  { href: '/ordering', ns: 'ordering', page: 'ordering', keys: ['mode', 'serviceTypes', 'rules', 'orderHeader', 'minOrder', 'deliveryFee', 'freeDeliveryOver', 'tips', 'customerFields', 'collectName', 'collectAddress', 'collectPickupTime', 'collectTable', 'notePlaceholder', 'paymentMethods', 'transferBank', 'transferHolder', 'transferAccount', 'transferNote', 'cashCount', 'cashDenomList', 'posTables'] },
  { href: '/contact', ns: 'contact', page: 'contact', keys: ['whatsapp', 'hours'] },
];
