'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import { Plus, Wifi, WifiOff, CloudUpload, Check, AlertTriangle, Zap, Grid3x3, ReceiptText, UserRound } from 'lucide-react';
import { posDb } from '@/lib/pos/db';
import { startSync, nowISO, retryDead, type SyncState } from '@/lib/pos/sync';
import { openTab } from '@/lib/pos/tabs';
import { openShift, closeShift } from '@/lib/pos/payments';
import type { PosTab, PosMenu, RegisterShift } from '@/lib/pos/types';
import { formatPrice } from '@/lib/utils';
import { TabScreen } from './TabScreen';
import { PosModal } from './PosModal';
import { ZReport } from './ZReport';
import { HistoryScreen } from './HistoryScreen';
import { DenomCount } from './DenomCount';
import { History } from 'lucide-react';

export function PosTerminal({
  tenantId,
  userId,
  restaurantName,
  currency,
  locale,
  cashCountMode,
  cashDenominations,
  posTables,
  menu: initialMenu,
}: {
  tenantId: string;
  userId: string;
  restaurantName: string;
  currency: string;
  locale: string;
  cashCountMode: 'total' | 'denominations';
  cashDenominations: number[] | null;
  posTables: number;
  menu: PosMenu;
}) {
  const t = useTranslations('pos');
  const db = useMemo(() => posDb(tenantId), [tenantId]);
  const [sync, setSync] = useState<SyncState>({ online: true, live: false, pending: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<'newTab' | 'openReg' | 'closeReg' | 'server' | null>(null);
  const [field, setField] = useState('');
  const [zShift, setZShift] = useState<RegisterShift | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [view, setView] = useState<'cuentas' | 'mesas'>(posTables > 0 ? 'mesas' : 'cuentas');
  const [serverName, setServerName] = useState('');

  // Active server is remembered per device (Fudo-style attribution).
  useEffect(() => {
    const id = setTimeout(() => setServerName(localStorage.getItem('pos_server') ?? ''), 0);
    return () => clearTimeout(id);
  }, []);
  function saveServer() {
    const v = field.trim();
    localStorage.setItem('pos_server', v);
    setServerName(v);
    setModal(null);
  }

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw-pos.js', { scope: '/pos' }).catch(() => {});
    } else {
      // In dev, make sure no stale POS service worker serves cached bundles.
      navigator.serviceWorker.getRegistrations().then((regs) =>
        regs.filter((r) => r.scope.includes('/pos')).forEach((r) => r.unregister()),
      );
      caches?.keys?.().then((keys) => keys.filter((k) => k.startsWith('kuik-pos')).forEach((k) => caches.delete(k)));
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

  // Look the open tab up by id (not from the open/held list) so it stays mounted
  // after payment marks it 'paid' — otherwise the success screen would unmount.
  const selectedTab = useLiveQuery(() => (selectedId ? db.tabs.get(selectedId) : undefined), [db, selectedId]);
  const selected = selectedTab ?? null;

  function openModal(kind: 'newTab' | 'openReg' | 'closeReg') {
    setField('');
    setModal(kind);
  }

  async function confirmNewTab() {
    const tab = await openTab(db, tenantId, userId, field.trim() || null, shiftId, serverName || null);
    setModal(null);
    setSelectedId(tab.id);
  }

  // Counter / quick sale: open a label-less tab and jump straight to the order pad.
  async function quickSale() {
    const tab = await openTab(db, tenantId, userId, null, shiftId, serverName || null);
    setSelectedId(tab.id);
  }

  // Tap a floor table: open its running tab, or start one tied to that table.
  async function tapTable(label: string) {
    const existing = (tabs ?? []).find((x) => x.table_label === label);
    if (existing) {
      setSelectedId(existing.id);
      return;
    }
    const tab = await openTab(db, tenantId, userId, label, shiftId, serverName || null);
    setSelectedId(tab.id);
  }

  async function confirmOpenReg() {
    await openShift(db, tenantId, userId, Number(field) || 0);
    setModal(null);
  }

  async function confirmCloseReg() {
    if (!shift) return;
    const closed = await closeShift(db, shift as RegisterShift, userId, Number(field) || 0);
    setModal(null);
    setZShift(closed);
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

  if (showHistory) {
    return (
      <HistoryScreen
        db={db}
        shiftId={shiftId}
        restaurantName={restaurantName}
        currency={currency}
        locale={locale}
        onBack={() => setShowHistory(false)}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-50 text-neutral-900">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <h1 className="text-lg font-bold">{t('title')}</h1>
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => {
              setField(serverName);
              setModal('server');
            }}
            className="flex items-center gap-1.5 rounded-full border border-neutral-300 px-2.5 py-1 text-neutral-600"
          >
            <UserRound className="h-4 w-4" /> {serverName || t('noServer')}
          </button>
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
            onClick={() => openModal('newTab')}
            className="flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 font-semibold text-white"
          >
            <Plus className="h-5 w-5" /> {t('newTab')}
          </button>
          <button
            onClick={quickSale}
            className="flex items-center gap-2 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white"
          >
            <Zap className="h-5 w-5" /> {t('quickSale')}
          </button>
          <button
            onClick={() => openModal(shift ? 'closeReg' : 'openReg')}
            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
              shift ? 'border-amber-300 text-amber-700' : 'border-neutral-300 text-neutral-600'
            }`}
          >
            {shift ? t('closeRegister') : t('openRegister')}
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="flex items-center gap-2 rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-600"
          >
            <History className="h-4 w-4" /> {t('history')}
          </button>
          {shift && (
            <span className="text-sm text-neutral-400">
              {t('registerOpen', { x: formatPrice((shift as RegisterShift).opening_cash, currency, locale) })}
            </span>
          )}
        </div>

        {posTables > 0 && (
          <div className="mb-4 inline-flex overflow-hidden rounded-xl border border-neutral-300 text-sm">
            <button
              onClick={() => setView('mesas')}
              className={`flex items-center gap-1.5 px-4 py-2 font-medium ${view === 'mesas' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
            >
              <Grid3x3 className="h-4 w-4" /> {t('tables')}
            </button>
            <button
              onClick={() => setView('cuentas')}
              className={`flex items-center gap-1.5 px-4 py-2 font-medium ${view === 'cuentas' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
            >
              <ReceiptText className="h-4 w-4" /> {t('accounts')}
            </button>
          </div>
        )}

        {posTables > 0 && view === 'mesas' ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: posTables }, (_, i) => String(i + 1)).map((label) => {
              const tab = (tabs ?? []).find((x) => x.table_label === label);
              return (
                <button
                  key={label}
                  onClick={() => tapTable(label)}
                  className={`flex aspect-square flex-col items-center justify-center rounded-2xl border p-2 text-center active:scale-[0.97] ${
                    tab ? 'border-green-300 bg-green-50' : 'border-neutral-200 bg-white'
                  }`}
                >
                  <span className="text-lg font-bold">{label}</span>
                  {tab ? (
                    <>
                      <span className="text-xs font-medium text-green-700">{formatPrice(tab.total, currency, locale)}</span>
                      {tab.server_name && <span className="text-[10px] text-neutral-400">{tab.server_name}</span>}
                    </>
                  ) : (
                    <span className="text-xs text-neutral-400">{t('free')}</span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (tabs ?? []).length === 0 ? (
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
                {tab.server_name && <p className="text-xs text-neutral-400">{tab.server_name}</p>}
              </button>
            ))}
          </div>
        )}
      </main>

      {modal === 'newTab' && (
        <PosModal title={t('newTab')} onClose={() => setModal(null)}>
          <input
            autoFocus
            value={field}
            onChange={(e) => setField(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmNewTab()}
            placeholder={t('tableLabelPh')}
            className="mb-4 w-full rounded-xl border border-neutral-200 px-3 py-3 text-base focus:border-neutral-400 focus:outline-none"
          />
          <button onClick={confirmNewTab} className="w-full rounded-full bg-neutral-900 py-3 font-semibold text-white">
            {t('create')}
          </button>
        </PosModal>
      )}

      {modal === 'server' && (
        <PosModal title={t('selectServer')} onClose={() => setModal(null)}>
          <input
            autoFocus
            value={field}
            onChange={(e) => setField(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveServer()}
            placeholder={t('server')}
            className="mb-4 w-full rounded-xl border border-neutral-200 px-3 py-3 text-base focus:border-neutral-400 focus:outline-none"
          />
          <button onClick={saveServer} className="w-full rounded-full bg-neutral-900 py-3 font-semibold text-white">
            {t('apply')}
          </button>
        </PosModal>
      )}

      {modal === 'openReg' && (
        <PosModal title={t('openRegister')} onClose={() => setModal(null)}>
          <label className="mb-1 block text-xs text-neutral-500">{t('openingCash')}</label>
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            value={field}
            onChange={(e) => setField(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmOpenReg()}
            placeholder="0"
            className="mb-4 w-full rounded-xl border border-neutral-200 px-3 py-3 text-base focus:border-neutral-400 focus:outline-none"
          />
          <button onClick={confirmOpenReg} className="w-full rounded-full bg-neutral-900 py-3 font-semibold text-white">
            {t('openRegister')}
          </button>
        </PosModal>
      )}

      {modal === 'closeReg' && (
        <PosModal title={cashCountMode === 'denominations' ? t('denomTitle') : t('closeRegister')} onClose={() => setModal(null)}>
          {cashCountMode === 'denominations' ? (
            <DenomCount
              onTotal={(tot) => setField(String(tot))}
              currency={currency}
              locale={locale}
              denoms={cashDenominations ?? undefined}
            />
          ) : (
            <>
              <label className="mb-1 block text-xs text-neutral-500">{t('countedCash')}</label>
              <input
                autoFocus
                type="number"
                inputMode="decimal"
                value={field}
                onChange={(e) => setField(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmCloseReg()}
                placeholder="0"
                className="w-full rounded-xl border border-neutral-200 px-3 py-3 text-base focus:border-neutral-400 focus:outline-none"
              />
            </>
          )}
          <button onClick={confirmCloseReg} className="mt-4 w-full rounded-full bg-neutral-900 py-3 font-semibold text-white">
            {t('closeRegister')}
          </button>
        </PosModal>
      )}

      {zShift && (
        <ZReport db={db} shift={zShift} currency={currency} locale={locale} onClose={() => setZShift(null)} />
      )}
    </div>
  );
}
