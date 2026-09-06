// Running out at the register ("86 the salmon", "no oat milk today").
//
// The terminal keeps the menu in menu_cache, so a change is applied there
// first (the grid greys the product at once, offline or not) and then reaches
// the server through the outbox as an RPC, the same path a sale takes:
// set_product_availability (0011/0045) for a product, set_option_availability
// (0078) for an option, which marks it by name in every product that has it.
// Other terminals hear the products row change over Realtime (lib/pos/sync.ts)
// and patch their own cache.
//
// The pure functions are separate from the store so tests cover the merging.

import type { Product, PricedOption } from '@/lib/database.types';
import type { PosDexie } from './db';
import { nowISO } from './sync';
import type { PosMenu } from './types';

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The menu with one product marked available or sold out. */
export function patchProductAvailability(menu: PosMenu, productId: string, available: boolean): PosMenu {
  return {
    ...menu,
    products: menu.products.map((p) => (p.id === productId ? { ...p, is_available: available } : p)),
  };
}

function markOptions(opts: PricedOption[] | null | undefined, name: string, available: boolean): PricedOption[] {
  return (opts ?? []).map((o) => (sameName(o.name, name) ? { ...o, available } : o));
}

/** The menu with an option (by name, wherever it appears) marked available or sold out. */
export function patchOptionAvailability(menu: PosMenu, name: string, available: boolean): PosMenu {
  return {
    ...menu,
    products: menu.products.map((p) => ({
      ...p,
      option_groups: (p.option_groups ?? []).map((g) => ({ ...g, options: markOptions(g.options, name, available) })),
      variants: markOptions(p.variants, name, available),
      modifiers: markOptions(p.modifiers, name, available),
    })),
  };
}

export interface OptionEntry {
  name: string;
  /** False when any product has it marked out; the RPC marks by name everywhere, so they agree. */
  available: boolean;
  /** How many products offer it. */
  products: number;
}

/** Every option a product offers, flattened: groups, then the legacy variants and modifiers. */
export function productOptions(p: Product): PricedOption[] {
  return [...(p.option_groups ?? []).flatMap((g) => g.options ?? []), ...(p.variants ?? []), ...(p.modifiers ?? [])];
}

/** Every option name in the menu, once, with its state. Sold-out ones first, then by name. */
export function optionCatalog(menu: PosMenu, products: Product[] = menu.products): OptionEntry[] {
  const byKey = new Map<string, OptionEntry>();
  for (const p of products) {
    const seen = new Set<string>();
    for (const o of productOptions(p)) {
      const name = o.name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const entry = byKey.get(key) ?? { name, available: true, products: 0 };
      if (o.available === false) entry.available = false;
      if (!seen.has(key)) {
        entry.products += 1;
        seen.add(key);
      }
      byKey.set(key, entry);
    }
  }
  return [...byKey.values()].sort((a, b) => Number(a.available) - Number(b.available) || a.name.localeCompare(b.name));
}

/** Products marked sold out, and options marked out, for the badge on the button. */
export function soldOutCount(menu: PosMenu): number {
  return menu.products.filter((p) => !p.is_available).length + optionCatalog(menu).filter((o) => !o.available).length;
}

// ── Store ──────────────────────────────────────────────────────────────────

async function patchCache(db: PosDexie, patch: (menu: PosMenu) => PosMenu): Promise<void> {
  const row = await db.menu_cache.get('menu');
  if (!row) return;
  await db.menu_cache.put({ ...row, data: patch(row.data as PosMenu), cached_at: nowISO() });
}

async function enqueueRpc(db: PosDexie, id: string, fn: string, args: Record<string, unknown>): Promise<void> {
  await db.outbox.add({
    entity: 'products',
    op: 'rpc',
    id,
    payload: { fn, args },
    updated_at: nowISO(),
    status: 'pending',
    attempts: 0,
  });
}

/** Mark a product sold out (or back). Applied locally at once; the server call travels through the outbox. `demo` keeps it local. */
export async function setProductAvailable(db: PosDexie, productId: string, available: boolean, demo = false): Promise<void> {
  await patchCache(db, (m) => patchProductAvailability(m, productId, available));
  if (!demo) await enqueueRpc(db, productId, 'set_product_availability', { p_id: productId, p_available: available });
}

/** Mark an option out (or back) by name, in every product that offers it. */
export async function setOptionAvailable(db: PosDexie, tenantId: string, name: string, available: boolean, demo = false): Promise<void> {
  await patchCache(db, (m) => patchOptionAvailability(m, name, available));
  if (!demo) await enqueueRpc(db, `option:${name.trim().toLowerCase()}`, 'set_option_availability', { p_tenant: tenantId, p_name: name.trim(), p_available: available });
}

/** A products row from Realtime, merged into the cached menu (another terminal, or the dashboard, changed it). */
export async function applyRemoteProduct(db: PosDexie, row: Product): Promise<void> {
  await patchCache(db, (m) => ({
    ...m,
    products: m.products.map((p) => (p.id === row.id ? { ...p, ...row } : p)),
  }));
}
