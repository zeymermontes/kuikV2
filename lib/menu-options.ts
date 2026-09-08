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

// ── Pasting groups onto products ────────────────────────────────────────────
// The editor copies a group, or all of a product's groups, to localStorage
// under these keys; the product drawer and the menu's multi-select paste them.
export const OPTION_CLIPBOARD_GROUP = 'kuik_clip_optiongroup';
export const OPTION_CLIPBOARD_ALL = 'kuik_clip_optiongroups';

const groupKey = (name: string) => name.trim().toLowerCase();

/** Whether any incoming group has the same name as one the product already has. */
export function hasRepeatedGroups(existing: OptionGroup[], incoming: OptionGroup[]): boolean {
  const names = new Set(existing.map((g) => groupKey(g.name)));
  return incoming.some((g) => names.has(groupKey(g.name)));
}

/**
 * The product's groups after pasting. `overwrite` replaces a group of the
 * same name where it stands and appends the rest; `duplicate` appends
 * everything, repeats included. Incoming groups always get fresh ids, so two
 * products never share one.
 */
export function mergeOptionGroups(existing: OptionGroup[], incoming: OptionGroup[], mode: 'overwrite' | 'duplicate', newId: () => string): OptionGroup[] {
  const fresh = incoming.map((g) => ({ ...g, id: newId(), options: g.options.map((o) => ({ ...o })) }));
  if (mode === 'duplicate') return [...existing, ...fresh];
  const byName = new Map(fresh.map((g) => [groupKey(g.name), g] as const));
  const replaced = new Set<string>();
  const out = existing.map((g) => {
    const key = groupKey(g.name);
    const next = byName.get(key);
    if (!next || replaced.has(key)) return g;
    replaced.add(key);
    return next;
  });
  return [...out, ...fresh.filter((g) => !replaced.has(groupKey(g.name)))];
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

/**
 * The groups with every one named `name` moved to the front or the back,
 * keeping the others in their order. Untouched (same array) when the product
 * has no such group, so the caller can skip the write.
 */
export function moveGroupByName(groups: OptionGroup[], name: string, to: 'first' | 'last'): OptionGroup[] {
  const key = groupKey(name);
  const hit = groups.filter((g) => groupKey(g.name) === key);
  if (hit.length === 0) return groups;
  const rest = groups.filter((g) => groupKey(g.name) !== key);
  return to === 'first' ? [...hit, ...rest] : [...rest, ...hit];
}
