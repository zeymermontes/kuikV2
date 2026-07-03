'use client';

import Dexie, { type Table } from 'dexie';
import type { PosTab, TabItem, Payment, RegisterShift, KitchenTicket, SyncEntity } from './types';

/** A queued mutation waiting to be flushed to Supabase (idempotent upsert/delete by id). */
export interface OutboxRow {
  seq?: number;
  entity: SyncEntity;
  op: 'upsert' | 'delete';
  id: string;
  payload: Record<string, unknown>;
  updated_at: string;
  status: 'pending' | 'sent' | 'dead';
  attempts: number;
  error?: string;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Cached menu data (products + resolved option groups) for offline order building. */
export interface MenuCacheRow {
  id: string; // e.g. `products` or `products:<branchId>`
  data: unknown;
  cached_at: string;
}

export class PosDexie extends Dexie {
  tabs!: Table<PosTab, string>;
  tab_items!: Table<TabItem, string>;
  payments!: Table<Payment, string>;
  register_shifts!: Table<RegisterShift, string>;
  kitchen_tickets!: Table<KitchenTicket, string>;
  menu_cache!: Table<MenuCacheRow, string>;
  outbox!: Table<OutboxRow, number>;
  meta!: Table<MetaRow, string>;

  constructor(tenantId: string) {
    super(`kuik_pos_${tenantId}`);
    this.version(1).stores({
      tabs: 'id, status, updated_at',
      tab_items: 'id, tab_id, updated_at',
      payments: 'id, tab_id, shift_id, updated_at',
      register_shifts: 'id, status, updated_at',
      kitchen_tickets: 'id, station, status, updated_at',
      menu_cache: 'id',
      outbox: '++seq, entity, status',
      meta: 'key',
    });
  }
}

const instances = new Map<string, PosDexie>();

/** One Dexie DB per tenant, memoized for the session. */
export function posDb(tenantId: string): PosDexie {
  let db = instances.get(tenantId);
  if (!db) {
    db = new PosDexie(tenantId);
    instances.set(tenantId, db);
  }
  return db;
}
