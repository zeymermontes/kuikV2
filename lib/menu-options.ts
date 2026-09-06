import type { Product, OptionGroup, OptionKind, PricedOption } from './database.types';

// A single chosen option on a cart line (flattened across groups).
export interface SelectedOption {
  group: string;
  name: string;
  price: number;
}

/**
 * The option groups to show for a product. Prefers the new dynamic
 * `option_groups`; falls back to synthesizing groups from the legacy
 * variants / modifiers / removables so existing menus keep working.
 */
export function resolveOptionGroups(p: Product): OptionGroup[] {
  if (p.option_groups && p.option_groups.length > 0) return p.option_groups;

  const groups: OptionGroup[] = [];
  if (p.variants?.length) {
    groups.push({ id: 'legacy-variants', name: 'Opción', required: true, multiple: false, options: p.variants });
  }
  if (p.modifiers?.length) {
    groups.push({ id: 'legacy-modifiers', name: 'Extras', required: false, multiple: true, options: p.modifiers });
  }
  if (p.removables?.length) {
    groups.push({
      id: 'legacy-removables',
      name: 'Quitar ingredientes',
      required: false,
      multiple: true,
      options: p.removables.map((n) => ({ name: `Sin ${n}`, price: 0 })),
    });
  }
  return groups;
}

export function hasOptions(p: Product): boolean {
  return resolveOptionGroups(p).length > 0;
}

export function optionKind(g: OptionGroup): OptionKind {
  return g.kind === 'takeaway' || g.kind === 'drink' ? g.kind : 'dish';
}

/** True when the product has anything worth opening a detail sheet for. */
export function hasDetail(p: Product): boolean {
  return Boolean(p.image_url || p.description) || hasOptions(p);
}

/** Whether an option can be picked right now. */
export function optionAvailable(o: PricedOption): boolean {
  return o.available !== false;
}

/** Every distinct option name across the menu, how many products carry it, and whether it is out anywhere. */
export function listOptionNames(products: Product[]): { name: string; count: number; available: boolean }[] {
  const map = new Map<string, { name: string; count: number; available: boolean }>();
  for (const p of products) {
    const opts = [...resolveOptionGroups(p).flatMap((g) => g.options)];
    const seen = new Set<string>();
    for (const o of opts) {
      const key = o.name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const cur = map.get(key) ?? { name: o.name.trim(), count: 0, available: true };
      cur.count++;
      if (!optionAvailable(o)) cur.available = false;
      map.set(key, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
