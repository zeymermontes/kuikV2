'use client';

import type { Category, Product } from '@/lib/database.types';
import type { PosDexie } from './db';
import type { PosMenu, PosTab } from './types';
import { openTab, addLineToTab } from './tabs';
import { openShift } from './payments';

// Demo mode (`/pos?demo=1`): the dashboard previews the terminal and the
// customer screen side by side. It runs the real components against a
// throwaway local database that never syncs, seeded with a shift and a sale
// so both previews have something to show the moment they load.

/** Sample menu for tenants that have not added products yet. */
export function sampleMenu(tenantId: string): PosMenu {
  const cats = ['Bebidas', 'Platos', 'Postres'];
  const products: [string, number, string][] = [
    ['Latte', 65, 'Bebidas'],
    ['Matcha', 75, 'Bebidas'],
    ['Limonada', 45, 'Bebidas'],
    ['Tacos al pastor', 95, 'Platos'],
    ['Hamburguesa', 145, 'Platos'],
    ['Ensalada César', 120, 'Platos'],
    ['Cheesecake', 85, 'Postres'],
    ['Brownie', 60, 'Postres'],
  ];
  const now = new Date().toISOString();
  const categories: Category[] = cats.map((name, i) => ({
    id: `demo-cat-${i}`,
    tenant_id: tenantId,
    branch_id: null,
    name,
    parent_id: null,
    position: i,
    icon: null,
    icon_image_url: null,
    banner_image_url: null,
    banner_name: null,
    theme: null,
    is_visible: true,
    station: null,
    created_at: now,
  }));
  return {
    categories,
    products: products.map(([name, price, cat], i) => ({
      id: `demo-prod-${i}`,
      tenant_id: tenantId,
      category_id: categories[cats.indexOf(cat)].id,
      name,
      description: null,
      price,
      compare_at_price: null,
      cost: null,
      sku: null,
      prep_time: null,
      calories: null,
      show_price: true,
      image_url: null,
      is_available: true,
      is_hidden: false,
      position: i,
      tags: [],
      variants: [],
      modifiers: [],
      removables: [],
      option_groups: [],
      created_at: now,
      updated_at: now,
    })) as Product[],
  };
}

/** First run only: an open register and a table with a few lines on it. Returns the seeded tab. */
export async function seedDemo(db: PosDexie, tenantId: string, userId: string, menu: PosMenu): Promise<PosTab | null> {
  if ((await db.tabs.count()) > 0) return null;
  const shift = await openShift(db, tenantId, userId, 500);
  const tab = await openTab(db, tenantId, userId, '4', shift.id, 'Ana');
  const priced = menu.products.filter((p) => p.price != null && p.is_available).slice(0, 3);
  for (const [i, p] of priced.entries()) {
    await addLineToTab(db, tenantId, tab.id, {
      key: p.id,
      productId: p.id,
      name: p.name,
      basePrice: p.price ?? 0,
      selections: [],
      qty: i === 0 ? 2 : 1,
    });
  }
  return tab;
}
