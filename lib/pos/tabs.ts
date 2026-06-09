'use client';

import type { PosDexie } from './db';
import { enqueueUpsert, newId, nowISO } from './sync';
import type { PosTab, TabItem } from './types';
import type { CartLine } from '@/lib/whatsapp';

const unitPrice = (base: number, selections: { price?: number }[]) =>
  base + selections.reduce((s, o) => s + (o.price || 0), 0);

export async function openTab(
  db: PosDexie,
  tenantId: string,
  userId: string,
  label: string | null,
  shiftId: string | null = null,
): Promise<PosTab> {
  const t = nowISO();
  const tab: PosTab = {
    id: newId(),
    tenant_id: tenantId,
    branch_id: null,
    table_label: label,
    customer_name: null,
    status: 'open',
    opened_by: userId,
    opened_at: t,
    closed_at: null,
    subtotal: 0,
    tip: 0,
    total: 0,
    shift_id: shiftId,
    created_at: t,
    updated_at: t,
  };
  return enqueueUpsert(db, 'tabs', tab);
}

/** Add a product (with its chosen options) to a tab as a new line. */
export async function addLineToTab(db: PosDexie, tenantId: string, tabId: string, line: CartLine): Promise<void> {
  const base = line.basePrice ?? 0;
  const t = nowISO();
  const item: TabItem = {
    id: newId(),
    tenant_id: tenantId,
    tab_id: tabId,
    product_id: line.productId,
    name: line.name,
    qty: line.qty,
    base_price: base,
    selections: line.selections,
    note: line.note ?? null,
    line_total: unitPrice(base, line.selections) * line.qty,
    course: 1,
    seat: null,
    fired_at: null,
    ticket_id: null,
    voided_at: null,
    created_at: t,
    updated_at: t,
  };
  await enqueueUpsert(db, 'tab_items', item);
  await recomputeTab(db, tabId);
}

export async function setItemQty(db: PosDexie, item: TabItem, qty: number): Promise<void> {
  if (qty <= 0) return voidItem(db, item);
  await enqueueUpsert(db, 'tab_items', { ...item, qty, line_total: unitPrice(item.base_price, item.selections) * qty });
  await recomputeTab(db, item.tab_id);
}

export async function voidItem(db: PosDexie, item: TabItem): Promise<void> {
  await enqueueUpsert(db, 'tab_items', { ...item, voided_at: nowISO() });
  await recomputeTab(db, item.tab_id);
}

/** Recompute and persist the tab's subtotal/total from its live (non-voided) items. */
export async function recomputeTab(db: PosDexie, tabId: string): Promise<void> {
  const items = await db.tab_items.where('tab_id').equals(tabId).toArray();
  const subtotal = items.filter((i) => !i.voided_at).reduce((s, i) => s + i.line_total, 0);
  const tab = await db.tabs.get(tabId);
  if (!tab) return;
  await enqueueUpsert(db, 'tabs', { ...tab, subtotal, total: subtotal + tab.tip });
}
