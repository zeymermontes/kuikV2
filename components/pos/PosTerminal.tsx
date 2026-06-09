'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Wifi, WifiOff, CloudUpload, Check } from 'lucide-react';
import { posDb } from '@/lib/pos/db';
import { startSync, enqueueUpsert, newId, nowISO, type SyncState } from '@/lib/pos/sync';
import type { PosTab } from '@/lib/pos/types';

export function PosTerminal({ tenantId, userId }: { tenantId: string; userId: string }) {
  const db = useMemo(() => posDb(tenantId), [tenantId]);
  const [sync, setSync] = useState<SyncState>({ online: true, live: false, pending: 0 });

  // Register the POS service worker (offline shell).
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-pos.js', { scope: '/pos' }).catch(() => {});
    }
  }, []);

  // Start the offline sync engine (outbox flush + realtime pull).
  useEffect(() => startSync(db, tenantId, setSync), [db, tenantId]);

  const tabs = useLiveQuery(
    () => db.tabs.where('status').anyOf('open', 'held').reverse().sortBy('updated_at'),
    [db],
    [] as PosTab[],
  );

  async function openTab() {
    const label = window.prompt('Mesa / nombre de la cuenta')?.trim();
    if (label === undefined) return;
    const t = nowISO();
    const tab: PosTab = {
      id: newId(),
      tenant_id: tenantId,
      branch_id: null,
      table_label: label || null,
      customer_name: null,
      status: 'open',
      opened_by: userId,
      opened_at: t,
      closed_at: null,
      subtotal: 0,
      tip: 0,
      total: 0,
      shift_id: null,
      created_at: t,
      updated_at: t,
    };
    await enqueueUpsert(db, 'tabs', tab);
  }

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 text-neutral-900">
      {/* Status bar */}
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <h1 className="text-lg font-bold">Kuik POS</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5">
            {sync.online ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-red-500" />}
            {sync.online ? 'En línea' : 'Sin conexión'}
          </span>
          <span className="flex items-center gap-1.5 text-neutral-500">
            {sync.pending > 0 ? (
              <>
                <CloudUpload className="h-4 w-4 text-amber-500" /> {sync.pending} por sincronizar
              </>
            ) : (
              <>
                <Check className="h-4 w-4 text-green-600" /> Sincronizado
              </>
            )}
          </span>
        </div>
      </header>

      {/* Tabs */}
      <main className="flex-1 p-4">
        <button
          onClick={openTab}
          className="mb-4 flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 font-semibold text-white"
        >
          <Plus className="h-5 w-5" /> Nueva cuenta
        </button>

        {(tabs ?? []).length === 0 ? (
          <p className="py-12 text-center text-neutral-400">Sin cuentas abiertas. Crea una para empezar.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(tabs ?? []).map((tab) => (
              <div key={tab.id} className="rounded-2xl border border-neutral-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{tab.table_label || 'Cuenta'}</span>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    {tab.status === 'held' ? 'En espera' : 'Abierta'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-neutral-400">${tab.total.toFixed(2)}</p>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
