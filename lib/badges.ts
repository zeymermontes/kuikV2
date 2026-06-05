// Preset product badges. Stored in products.tags as their `key`. The render
// maps the key → emoji + label + color. Unknown tags render as plain chips.

export interface BadgeDef {
  key: string;
  emoji: string;
  es: string;
  en: string;
  color: string; // background tint
  text: string; // text color
}

export const BADGES: BadgeDef[] = [
  { key: 'new', emoji: '✨', es: 'Nuevo', en: 'New', color: '#dbeafe', text: '#1e40af' },
  { key: 'bestseller', emoji: '🔥', es: 'Más vendido', en: 'Bestseller', color: '#fef3c7', text: '#92400e' },
  { key: 'spicy', emoji: '🌶️', es: 'Picante', en: 'Spicy', color: '#fee2e2', text: '#991b1b' },
  { key: 'vegan', emoji: '🌱', es: 'Vegano', en: 'Vegan', color: '#dcfce7', text: '#166534' },
  { key: 'vegetarian', emoji: '🥗', es: 'Vegetariano', en: 'Vegetarian', color: '#dcfce7', text: '#166534' },
  { key: 'glutenfree', emoji: '🌾', es: 'Sin gluten', en: 'Gluten-free', color: '#f5f5f4', text: '#44403c' },
  { key: 'house', emoji: '⭐', es: 'De la casa', en: 'House special', color: '#ede9fe', text: '#5b21b6' },
  { key: 'promo', emoji: '🏷️', es: 'Promoción', en: 'On sale', color: '#ffe4e6', text: '#9f1239' },
];

const BADGE_MAP = new Map(BADGES.map((b) => [b.key, b]));

export function getBadge(key: string): BadgeDef | undefined {
  return BADGE_MAP.get(key);
}

export function badgeLabel(b: BadgeDef, locale: string): string {
  return locale === 'en' ? b.en : b.es;
}
