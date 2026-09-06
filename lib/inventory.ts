// Inventory arithmetic, pure: recipe costs, what is running low, unit labels.

import type { Ingredient, RecipeLine } from '@/lib/database.types';

export const UNITS = ['pza', 'g', 'kg', 'ml', 'l', 'porcion'] as const;
export type Unit = (typeof UNITS)[number];

export const MOVEMENT_KINDS = ['sale', 'purchase', 'waste', 'count', 'adjust'] as const;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** What one unit of the product costs to make, from its recipe and the ingredients' last costs. */
export function recipeCost(recipe: RecipeLine[], ingredients: Pick<Ingredient, 'id' | 'cost_per_unit'>[]): number {
  const cost = new Map(ingredients.map((i) => [i.id, Number(i.cost_per_unit) || 0]));
  return r2(recipe.reduce((s, l) => s + (cost.get(l.ingredient_id) ?? 0) * Number(l.qty), 0));
}

/** Ingredients at or under their minimum (those without a minimum never are). */
export function lowStock<T extends Pick<Ingredient, 'stock' | 'min_stock' | 'active'>>(ingredients: T[]): T[] {
  return ingredients.filter((i) => i.active && i.min_stock != null && Number(i.stock) <= Number(i.min_stock));
}

/** How many units of a product the stock still covers; null when it has no recipe. */
export function portionsLeft(recipe: RecipeLine[], ingredients: Pick<Ingredient, 'id' | 'stock'>[]): number | null {
  if (recipe.length === 0) return null;
  const stock = new Map(ingredients.map((i) => [i.id, Number(i.stock) || 0]));
  return Math.max(0, Math.floor(Math.min(...recipe.map((l) => (Number(l.qty) > 0 ? (stock.get(l.ingredient_id) ?? 0) / Number(l.qty) : Infinity)))));
}

/** Total of a purchase order's lines. */
export function purchaseTotal(items: { qty: number; cost: number }[]): number {
  return r2(items.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.cost) || 0), 0));
}

/** "250 g", "1.5 kg", "3 pza". */
export function formatQty(qty: number, unit: string): string {
  const n = Number(qty) || 0;
  const s = Number.isInteger(n) ? String(n) : n.toFixed(n < 1 ? 3 : 2).replace(/\.?0+$/, '');
  return `${s} ${unit}`;
}
