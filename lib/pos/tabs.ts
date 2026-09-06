'use client';

import type { PosDexie } from './db';
import { enqueueUpsert, newId, nowISO } from './sync';
import type { PosTab, TabItem } from './types';
import type { PosMenu } from './types';
import { applyPromotions } from '@/lib/promotions';
import type { CartLine } from '@/lib/whatsapp';

const unitPrice = (base: number, selections: { price?: number }[]) =>
  base + selections.reduce((s, o) => s + (o.price || 0), 0);

export async function openTab(
  db: PosDexie,
  tenantId: string,
  userId: string,
  label: string | null,
  shiftId: string | null = null,
  serverName: string | null = null,
  employeeId: string | null = null,
): Promise<PosTab> {
  const t = nowISO();
  const tab: PosTab = {
    id: newId(),
    tenant_id: tenantId,
    branch_id: null,
    table_label: label,
    customer_name: null,
    customer_phone: null,
    loyalty_customer_id: null,
    loyalty_awarded_at: null,
    server_name: serverName,
    employee_id: employeeId,
    status: 'open',
    opened_by: userId,
    opened_at: t,
    closed_at: null,
    subtotal: 0,
    discount: 0,
    tip: 0,
    total: 0,
    refunded: 0,
    promo_discount: 0,
    promos: null,
    promo_code: null,
    guests: 1,
    void_reason: null,
    shift_id: shiftId,
    created_at: t,
    updated_at: t,
  };
  return enqueueUpsert(db, 'tabs', tab);
}

export async function setDiscount(db: PosDexie, tab: PosTab, discount: number): Promise<void> {
  const d = Math.max(0, Math.min(discount, tab.subtotal));
  await enqueueUpsert(db, 'tabs', { ...tab, discount: d });
  await recomputeTab(db, tab.id);
}

/** Type (or clear) a coupon on the sale; the promotions are re-figured. Returns false when the code matches nothing live. */
export async function setPromoCode(db: PosDexie, tab: PosTab, code: string | null): Promise<boolean> {
  const c = code?.trim().toUpperCase() || null;
  await enqueueUpsert(db, 'tabs', { ...tab, promo_code: c });
  return recomputeTab(db, tab.id);
}

export async function setGuests(db: PosDexie, tab: PosTab, guests: number): Promise<void> {
  await enqueueUpsert(db, 'tabs', { ...tab, guests: Math.max(1, guests) });
}

export async function voidTab(db: PosDexie, tab: PosTab, reason: string | null): Promise<void> {
  await enqueueUpsert(db, 'tabs', { ...tab, status: 'void', void_reason: reason, closed_at: nowISO() });
}

export async function reopenTab(db: PosDexie, tab: PosTab): Promise<void> {
  await enqueueUpsert(db, 'tabs', { ...tab, status: 'open', closed_at: null });
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

/**
 * Recompute and persist the tab's subtotal, promotions and total from its
 * live (non-voided) items. Promotions come from the offline store and the
 * cached menu (for categories); the device's own clock decides happy hour.
 * Returns false when the sale's coupon matches no live promotion.
 */
export async function recomputeTab(db: PosDexie, tabId: string): Promise<boolean> {
  const items = await db.tab_items.where('tab_id').equals(tabId).toArray();
  const live = items.filter((i) => !i.voided_at);
  const subtotal = live.reduce((s, i) => s + i.line_total, 0);
  const tab = await db.tabs.get(tabId);
  if (!tab) return true;
  const discount = Math.min(tab.discount ?? 0, subtotal);

  const [promos, cached] = await Promise.all([db.promotions.toArray(), db.menu_cache.get('menu')]);
  const menu = (cached?.data ?? null) as PosMenu | null;
  const categoryOf = new Map((menu?.products ?? []).map((p) => [p.id, p.category_id]));
  const result = applyPromotions(
    promos,
    live.map((i) => ({ productId: i.product_id, categoryId: i.product_id ? (categoryOf.get(i.product_id) ?? null) : null, unitPrice: i.qty ? i.line_total / i.qty : 0, qty: i.qty })),
    { channel: 'pos', code: tab.promo_code },
  );
  const promoDiscount = Math.min(result.discount, Math.max(0, subtotal - discount));
  await enqueueUpsert(db, 'tabs', {
    ...tab,
    subtotal,
    discount,
    promo_discount: promoDiscount,
    promos: result.applied.length ? result.applied : null,
    total: Math.max(0, subtotal - discount - promoDiscount + tab.tip),
  });
  return !result.badCode;
}
