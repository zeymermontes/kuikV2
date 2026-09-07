// Sold out at one location (branch_sold_out, migration 0083), laid over a
// menu's products. Pure: the public menu (server), the register (client) and
// the tests use the same overlay.

import type { PricedOption, Product } from '@/lib/database.types';

export interface SoldOutRow {
  branch_id: string | null;
  product_id: string | null;
  option_key: string | null;
}

/** How an option is matched across products: by name, lower and trimmed (0078). */
export function optionKey(name: string): string {
  return name.trim().toLowerCase();
}

const markOptions = (opts: PricedOption[] | null | undefined, keys: Set<string>): PricedOption[] =>
  (opts ?? []).map((o) => (keys.has(optionKey(o.name)) ? { ...o, available: false } : o));

/** The same overlay with rows already known to be this location's (the register's cache). */
export function applySoldOutHere<P extends Product>(products: P[], rows: SoldOutRow[]): P[] {
  return applySoldOut(products, rows.map((r) => ({ ...r, branch_id: null })), null);
}

/**
 * The products as this location sees them: the restaurant-wide switch
 * (is_available) still applies, and on top of it what ran out here.
 * `rows` may hold every location's rows; only this one's are applied.
 */
export function applySoldOut<P extends Product>(products: P[], rows: SoldOutRow[], locationId: string | null): P[] {
  const here = rows.filter((r) => (r.branch_id ?? null) === (locationId ?? null));
  if (here.length === 0) return products;
  const productIds = new Set(here.map((r) => r.product_id).filter((id): id is string => !!id));
  const optionKeys = new Set(here.map((r) => r.option_key).filter((k): k is string => !!k));
  return products.map((p) => {
    let next = p;
    if (productIds.has(p.id)) next = { ...next, is_available: false };
    if (optionKeys.size > 0) {
      next = {
        ...next,
        option_groups: (next.option_groups ?? []).map((g) => ({ ...g, options: markOptions(g.options, optionKeys) })),
        variants: markOptions(next.variants, optionKeys),
        modifiers: markOptions(next.modifiers, optionKeys),
      };
    }
    return next;
  });
}
