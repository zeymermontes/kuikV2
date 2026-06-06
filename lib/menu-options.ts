import type { Product, OptionGroup } from './database.types';

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
