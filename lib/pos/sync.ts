'use client';

import type { Table } from 'dexie';
import type { PosDexie } from './db';
import { SYNC_ENTITIES, type SyncEntity } from './types';
import { createClient } from '@/lib/supabase/client';

type Supabase = ReturnType<typeof createClient>;
type Row = { id: string; updated_at: string; tenant_id: string };

export const nowISO = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

function tableFor(db: PosDexie, entity: SyncEntity): Table<Row, string> {
  return (db as unknown as Record<SyncEntity, Table<Row, string>>)[entity];
}

/** Optimistically write a row locally and queue an idempotent upsert for the server. */
export async function enqueueUpsert<T extends Row>(db: PosDexie, entity: SyncEntity, row: T): Promise<T> {
  const next = { ...row, updated_at: nowISO() } as T;
  await db.transaction('rw', tableFor(db, entity), db.outbox, async () => {
    await tableFor(db, entity).put(next);
    await db.outbox.add({
      entity,
      op: 'upsert',
      id: next.id,
      payload: next as unknown as Record<string, unknown>,
      updated_at: next.updated_at,
      status: 'pending',
      attempts: 0,
    });
  });
  return next;
}

/** Apply a server row to the local store using last-write-wins on updated_at. */
async function applyRemote(db: PosDexie, entity: SyncEntity, row: Row): Promise<void> {
  const table = tableFor(db, entity);
  const local = await table.get(row.id);
  if (!local || String(row.updated_at) >= String(local.updated_at)) {
    await table.put(row);
  }
}

export async function pendingCount(db: PosDexie): Promise<number> {
  return db.outbox.where('status').equals('pending').count();
}

/** Flush queued mutations to Supabase in order. Network errors retry; hard errors go to `dead`. */
export async function flushOutbox(db: PosDexie, supabase: Supabase): Promise<void> {
  const pending = await db.outbox.where('status').equals('pending').sortBy('seq');
  for (const item of pending) {
    try {
      const { error } =
        item.op === 'delete'
          ? await supabase.from(item.entity).delete().eq('id', item.id)
          : await supabase.from(item.entity).upsert(item.payload, { onConflict: 'id' });
      if (error) {
        await db.outbox.update(item.seq!, { status: 'dead', error: error.message, attempts: item.attempts + 1 });
        continue; // surface, keep going
      }
      await db.outbox.delete(item.seq!);
    } catch {
      // Network/offline: stop and retry the whole queue later (preserves order).
      await db.outbox.update(item.seq!, { attempts: item.attempts + 1 });
      return;
    }
  }
}

async function catchUp(db: PosDexie, supabase: Supabase, tenantId: string, entity: SyncEntity): Promise<void> {
  const cursorRow = await db.meta.get(`cursor_${entity}`);
  const cursor = typeof cursorRow?.value === 'string' ? cursorRow.value : undefined;
  let q = supabase
    .from(entity)
    .select('*')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: true })
    .limit(1000);
  if (cursor) q = q.gt('updated_at', cursor);
  const { data, error } = await q;
  if (error || !data || data.length === 0) return;
  for (const row of data as Row[]) await applyRemote(db, entity, row);
  await db.meta.put({ key: `cursor_${entity}`, value: (data[data.length - 1] as Row).updated_at });
}

export interface SyncState {
  online: boolean;
  live: boolean;
  pending: number;
}

/** Start the realtime pull + outbox flush loop. Returns a stop() cleanup. */
export function startSync(
  db: PosDexie,
  tenantId: string,
  onState?: (s: SyncState) => void,
): () => void {
  const supabase = createClient();
  let live = false;
  let stopped = false;

  const emit = async () => {
    if (!stopped) onState?.({ online: navigator.onLine, live, pending: await pendingCount(db) });
  };

  const sync = async () => {
    if (!navigator.onLine) return emit();
    await flushOutbox(db, supabase);
    emit();
  };

  let channel = supabase.channel(`pos-${tenantId}`);
  for (const entity of SYNC_ENTITIES) {
    channel = channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: entity, filter: `tenant_id=eq.${tenantId}` },
      (payload) => {
        if (payload.eventType !== 'DELETE') applyRemote(db, entity, payload.new as Row).then(emit);
      },
    );
  }
  channel.subscribe(async (status) => {
    live = status === 'SUBSCRIBED';
    if (live) {
      for (const entity of SYNC_ENTITIES) await catchUp(db, supabase, tenantId, entity);
      await sync();
    }
    emit();
  });

  const onOnline = () => sync();
  const onOffline = () => emit();
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  const interval = setInterval(sync, 15_000);
  emit();

  return () => {
    stopped = true;
    clearInterval(interval);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    supabase.removeChannel(channel);
  };
}
