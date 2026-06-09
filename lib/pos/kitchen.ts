'use client';

import type { PosDexie } from './db';
import { enqueueUpsert, newId, nowISO } from './sync';
import type { KitchenTicket, TabItem, PosTab } from './types';

/** Fire the tab's un-fired items to the kitchen, one ticket per station. */
export async function fireToKitchen(
  db: PosDexie,
  tenantId: string,
  userId: string,
  tab: PosTab,
  items: TabItem[],
  stationOf: (productId: string | null) => string,
): Promise<void> {
  const unfired = items.filter((i) => !i.voided_at && !i.fired_at);
  if (unfired.length === 0) return;

  const byStation = new Map<string, TabItem[]>();
  for (const it of unfired) {
    const st = stationOf(it.product_id);
    const arr = byStation.get(st) ?? [];
    arr.push(it);
    byStation.set(st, arr);
  }

  const t = nowISO();
  for (const [station, group] of byStation) {
    const ticketId = newId();
    const ticket: KitchenTicket = {
      id: ticketId,
      tenant_id: tenantId,
      branch_id: null,
      tab_id: tab.id,
      station,
      table_label: tab.table_label,
      status: 'new',
      fired_by: userId,
      fired_at: t,
      items: group.map((g) => ({ name: g.name, qty: g.qty, selections: g.selections, note: g.note })),
      created_at: t,
      updated_at: t,
    };
    await enqueueUpsert(db, 'kitchen_tickets', ticket);
    for (const g of group) await enqueueUpsert(db, 'tab_items', { ...g, fired_at: t, ticket_id: ticketId });
  }
}
