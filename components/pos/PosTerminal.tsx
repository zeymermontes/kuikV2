'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import { Plus, Wifi, WifiOff, CloudUpload, Check, AlertTriangle } from 'lucide-react';
import { posDb } from '@/lib/pos/db';
import { startSync, nowISO, retryDead, type SyncState } from '@/lib/pos/sync';
import { openTab } from '@/lib/pos/tabs';
import { openShift, closeShift } from '@/lib/pos/payments';
import type { PosTab, PosMenu, RegisterShift } from '@/lib/pos/types';
import { formatPrice } from '@/lib/utils';
import { TabScreen } from './TabScreen';

export function PosTerminal({
  tenantId,
  userId,
  restaurantName,
  currency,
  locale,
  menu: initialMenu,
}: {
  tenantId: string;
  userId: string;
  restaurantName: string;
  currency: string;
  locale: string;
  menu: PosMenu;
}) {
  const t = useTranslations('pos');
  const db = useMemo(() => posDb(tenantId), [tenantId]);
  const [sync, setSync] = useState<SyncState>({ online: true, live: false, pending: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-pos.js', { scope: '/pos' }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    db.menu_cache.put({ id: 'menu', data: initialMenu, cached_at: nowISO() });
  }, [db, initialMenu]);

  useEffect(() => startSync(db, tenantId, setSync), [db, tenantId]);

  const cached = useLiveQuery(() => db.menu_cache.get('menu'), [db]);
  const menu = (cached?.data as PosMenu | undefined) ?? initialMenu;

  const tabs = useLiveQuery(
    () => db.tabs.where('status').anyOf('open', 'held').reverse().sortBy('updated_at'),
    [db],
    [] as PosTab[],
  );
  const shift = useLiveQuery(() => db.register_shifts.where('status').equals('open').first(), [db]);
  const shiftId = shift?.id ?? null;
  const failed = useLiveQuery(() => db.outbox.where('status').equals('dead').count(), [db], 0);

  const selected = (tabs ?? []).find((x) => x.id === selectedId) ?? null;

  async function newTab() {
    const label = window.prompt(t('tabPrompt'))?.trim();
    if (label === undefined) return;
    const tab = await openTab(db, tenantId, userId, label || null);
    setSelectedId(tab.id);
  }

  async function toggleRegister() {
    if (!shift) {
      const v = window.prompt(t('openCashPrompt'));
      if (v === null) return;
      await openShift(db, tenantId, userId, Number(v) || 0);
    } else {
      const v = window.prompt(t('closeCashPrompt'));
      if (v === null) return;
      const closed = await closeShift(db, shift as RegisterShift, userId, Number(v) || 0);
      window.alert(
        `${t('zTitle')}\n${t('zExpected')}: ${formatPrice(closed.expected_cash ?? 0, currency, locale)}\n` +
          `${t('zCounted')}: ${formatPrice(closed.closing_cash ?? 0, currency, locale)}\n` +
          `${t('zDiff')}: ${formatPrice(closed.over_short ?? 0, currency, locale)}`,
      );
    }
  }

  if (selected) {
    return (
      <TabScreen
        db={db}
        tab={selected}
        menu={menu}
        tenantId={tenantId}
        userId={userId}
        shiftId={shiftId}
        restaurantName={restaurantName}
        currency={currency}
        locale={locale}
        onBack={() => setSelectedId(null)}
        onPaid={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 text-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <div className="flex items-center gap-3 text-sm">
          <span className="flex items-center gap-1.5">
            {sync.online ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-red-500" />}
            {sync.online ? t('online') : t('offline')}
          </span>
          <span className="flex items-center gap-1.5 text-neutral-500">
            {sync.pending > 0 ? (
              <>
                <CloudUpload className="h-4 w-4 text-amber-500" /> {t('pending', { n: sync.pending })}
              </>
            ) : (
              <>
                <Check className="h-4 w-4 text-green-600" /> {t('synced')}
              </>
            )}
          </span>
        </div>
      </header>

      {failed > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4" /> {t('syncErrors', { n: failed })}
          </span>
          <button onClick={() => retryDead(db)} className="rounded-lg border border-red-300 px-2 py-1 font-medium">
            {t('retry')}
          </button>
        </div>
      )}

      <main className="flex-1 p-4">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            onClick={newTab}
            className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 font-semibold text-white"
          >
            <Plus className="h-5 w-5" /> {t('newTab')}
          </button>
          <button
            onClick={toggleRegister}
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              shift ? 'border-amber-300 text-amber-700' : 'border-neutral-300 text-neutral-600'
            }`}
          >
            {shift ? t('closeRegister') : t('openRegister')}
          </button>
          {shift && (
            <span className="text-sm text-neutral-400">
              {t('registerOpen', { x: formatPrice((shift as RegisterShift).opening_cash, currency, locale) })}
            </span>
          )}
        </div>

        {(tabs ?? []).length === 0 ? (
          <p className="py-12 text-center text-neutral-400">{t('noTabs')}</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {(tabs ?? []).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedId(tab.id)}
                className="rounded-2xl border border-neutral-200 bg-white p-4 text-left active:bg-neutral-100"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{tab.table_label || t('tab')}</span>
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                    {tab.status === 'held' ? t('held') : t('open')}
                  </span>
                </div>
                <p className="mt-2 text-sm text-neutral-500">{formatPrice(tab.total, currency, locale)}</p>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
