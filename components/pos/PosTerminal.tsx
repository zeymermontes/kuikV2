'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import {
  Plus,
  Search,
  Bell,
  Maximize2,
  Minimize2,
  PauseCircle,
  ShoppingCart,
  LayoutGrid,
  ReceiptText,
  History,
  Wallet,
  ChefHat,
  MonitorSmartphone,
  Settings,
  ChevronDown,
  Wifi,
  WifiOff,
  CloudUpload,
  Check,
  AlertTriangle,
  Clock,
  Cast,
  ExternalLink,
} from 'lucide-react';
import { posDb } from '@/lib/pos/db';
import { startSync, nowISO, retryDead, enqueueUpsert, type SyncState } from '@/lib/pos/sync';
import { openTab } from '@/lib/pos/tabs';
import { openShift, closeShift } from '@/lib/pos/payments';
import { sampleMenu, seedDemo } from '@/lib/pos/demo';
import {
  canPresent,
  openCustomerScreen,
  presentCustomerScreen,
  useDisplayPublisher,
  type DisplayBrand,
  type DisplayState,
} from '@/lib/pos/customer-screen';
import { demoScope, type PosTab, type PosMenu, type RegisterShift, type TabItem } from '@/lib/pos/types';
import { formatPrice } from '@/lib/utils';
import { SaleScreen, type PayPhase } from './SaleScreen';
import { PosModal } from './PosModal';
import { ZReport } from './ZReport';
import { HistoryScreen } from './HistoryScreen';
import { DenomCount } from './DenomCount';
import { ExplainLayer } from '@/components/ExplainLayer';

type View = 'sale' | 'tables' | 'orders' | 'history' | 'register';
type Modal = 'newTab' | 'openReg' | 'closeReg' | 'server' | null;

const INPUT = 'w-full rounded-xl border border-neutral-200 px-3 py-3 text-base focus:border-pos-accent focus:outline-none';
const PRIMARY = 'w-full rounded-xl bg-pos-accent py-3 font-semibold text-white hover:bg-pos-accent-hover';

export function PosTerminal({
  tenantId,
  userId,
  restaurantName,
  brand,
  currency,
  locale,
  cashCountMode,
  cashDenominations,
  posTables,
  floorTables = [],
  menu: initialMenu,
  themeStyle,
  demo = false,
  explain = false,
}: {
  tenantId: string;
  userId: string;
  restaurantName: string;
  brand: DisplayBrand;
  currency: string;
  locale: string;
  cashCountMode: 'total' | 'denominations';
  cashDenominations: number[] | null;
  posTables: number;
  /** Tables from the host stand's floor plan; when present they replace the numbered grid. */
  floorTables?: { label: string; seats: number; area: string | null }[];
  menu: PosMenu;
  /** Brand colours as CSS variables (lib/pos/theme.ts). */
  themeStyle?: React.CSSProperties;
  /** Dashboard preview: throwaway local store, no sync, seeded sale. */
  demo?: boolean;
  /** Tutorials: start in explain mode (taps describe instead of act). */
  explain?: boolean;
}) {
  const t = useTranslations('pos');
  const money = (n: number) => formatPrice(n, currency, locale);
  const scope = demo ? demoScope(tenantId) : tenantId;
  const db = useMemo(() => posDb(demo ? `demo_${tenantId}` : tenantId), [tenantId, demo]);

  const [sync, setSync] = useState<SyncState>({ online: true, live: false, pending: 0 });
  const [view, setView] = useState<View>('sale');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [field, setField] = useState('');
  const [zShift, setZShift] = useState<RegisterShift | null>(null);
  const [serverName, setServerName] = useState('');
  const [query, setQuery] = useState('');
  const [bell, setBell] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [payPhase, setPayPhase] = useState<PayPhase | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
    if (demo || !('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw-pos.js', { scope: '/pos' }).catch(() => {});
    } else {
      // In dev, make sure no stale POS service worker serves cached bundles.
      navigator.serviceWorker.getRegistrations().then((regs) =>
        regs.filter((r) => r.scope.includes('/pos')).forEach((r) => r.unregister()),
      );
      caches?.keys?.().then((keys) => keys.filter((k) => k.startsWith('kuik-pos')).forEach((k) => caches.delete(k)));
    }
  }, [demo]);

  const seedMenu = useMemo(
    () => (demo && initialMenu.products.length === 0 ? sampleMenu(tenantId) : initialMenu),
    [demo, initialMenu, tenantId],
  );
  useEffect(() => {
    db.menu_cache.put({ id: 'menu', data: seedMenu, cached_at: nowISO() });
  }, [db, seedMenu]);

  useEffect(() => {
    if (demo) return;
    return startSync(db, tenantId, setSync);
  }, [db, tenantId, demo]);

  // Demo: a running sale on first load so both previews have something to show.
  useEffect(() => {
    if (!demo) return;
    seedDemo(db, tenantId, userId, seedMenu).then(async (tab) => {
      // Fresh store: the seeded sale. Otherwise pick up the newest open one.
      const pick = tab ?? (await db.tabs.where('status').anyOf('open', 'held').reverse().sortBy('updated_at'))[0];
      if (pick) setSelectedId(pick.id);
    });
  }, [demo, db, tenantId, userId, seedMenu]);

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // ⌘K / Ctrl+K focuses the product search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setView('sale');
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  const cached = useLiveQuery(() => db.menu_cache.get('menu'), [db]);
  const menu = (cached?.data as PosMenu | undefined) ?? seedMenu;

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
  const items = useLiveQuery(
    () => (selectedId ? db.tab_items.where('tab_id').equals(selectedId).toArray() : Promise.resolve([] as TabItem[])),
    [db, selectedId],
    [] as TabItem[],
  );
  const live = useMemo(() => (items ?? []).filter((i) => !i.voided_at), [items]);

  // ── Customer screen ────────────────────────────────────────────────────────
  const publish = useDisplayPublisher(scope, brand);
  useEffect(() => {
    const imageOf = new Map(menu.products.map((p) => [p.id, p.image_url] as const));
    const state: DisplayState = selected
      ? {
          phase: payPhase?.phase ?? (selected.status === 'paid' ? 'paid' : 'sale'),
          label: selected.table_label,
          lines: live.map((i) => ({
            id: i.id,
            name: i.name,
            qty: i.qty,
            total: i.line_total,
            options: i.selections.map((s) => s.name).join(', '),
            image: i.product_id ? (imageOf.get(i.product_id) ?? null) : null,
          })),
          subtotal: selected.subtotal,
          discount: selected.discount,
          tip: payPhase?.tip ?? selected.tip,
          total: payPhase?.total ?? selected.total,
          due: payPhase?.due,
          paid: payPhase?.paid,
          change: payPhase?.change,
          method: payPhase?.method,
          at: Date.now(),
        }
      : { phase: 'idle', label: null, lines: [], subtotal: 0, discount: 0, tip: 0, total: 0, at: Date.now() };
    publish(state);
  }, [publish, selected, live, payPhase, menu.products]);

  const customerUrl = `/pos/customer${demo ? '?demo=1' : ''}`;
  async function launchCustomerScreen() {
    const r = await openCustomerScreen(customerUrl);
    setToast(r === 'second-screen' ? t('screenSecond') : r === 'window' ? t('screenWindow') : t('screenBlocked'));
  }
  async function castCustomerScreen() {
    const ok = await presentCustomerScreen(new URL(customerUrl, window.location.origin).toString());
    if (!ok) setToast(t('screenBlocked'));
  }

  // ── Tabs ───────────────────────────────────────────────────────────────────
  function select(id: string | null) {
    setPayPhase(null);
    setSelectedId(id);
    setView('sale');
  }

  // Counter / quick sale: a label-less tab, created the moment the first product is tapped.
  const ensureTab = useCallback(async (): Promise<PosTab> => {
    if (selected && selected.status !== 'paid' && selected.status !== 'void') return selected;
    const tab = await openTab(db, tenantId, userId, null, shiftId, serverName || null);
    setPayPhase(null);
    setSelectedId(tab.id);
    return tab;
  }, [db, tenantId, userId, shiftId, serverName, selected]);

  async function confirmNewTab() {
    const tab = await openTab(db, tenantId, userId, field.trim() || null, shiftId, serverName || null);
    setModal(null);
    select(tab.id);
  }

  function newSale() {
    setQuery('');
    select(null);
  }

  async function holdSale() {
    if (!selected) return;
    if (selected.status === 'open') await enqueueUpsert(db, 'tabs', { ...selected, status: 'held' });
    select(null);
  }

  // Tap a floor table: open its running tab, or start one tied to that table.
  async function tapTable(label: string) {
    const existing = (tabs ?? []).find((x) => x.table_label === label);
    if (existing) return select(existing.id);
    const tab = await openTab(db, tenantId, userId, label, shiftId, serverName || null);
    select(tab.id);
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
  function openModal(kind: Modal) {
    setField('');
    setModal(kind);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }

  const openCount = (tabs ?? []).length;
  const initials = (serverName || t('cashier'))
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const navItems: { key: View; icon: typeof ShoppingCart; label: string; badge?: number }[] = [
    { key: 'sale', icon: ShoppingCart, label: t('sales') },
    ...(posTables > 0 || floorTables.length > 0 ? [{ key: 'tables' as View, icon: LayoutGrid, label: t('tables') }] : []),
    { key: 'orders', icon: ReceiptText, label: t('accounts'), badge: openCount },
    { key: 'history', icon: History, label: t('history') },
    { key: 'register', icon: Wallet, label: t('register') },
  ];

  const renderNav = (item: (typeof navItems)[number], mobile?: boolean) => {
    const active = view === item.key;
    const Icon = item.icon;
    return (
      <button
        key={item.key}
        data-help={`pos_nav_${item.key}`}
        onClick={() => setView(item.key)}
        className={
          mobile
            ? `relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${active ? 'text-pos-accent' : 'text-neutral-500'}`
            : `relative flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition xl:px-4 ${
                active ? 'bg-pos-accent text-pos-accent-text shadow-lg shadow-black/30' : 'text-neutral-300 hover:bg-white/5 hover:text-white'
              }`
        }
        title={item.label}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span className={mobile ? '' : 'hidden xl:inline'}>{item.label}</span>
        {!!item.badge && (
          <span
            className={`absolute rounded-full bg-pos-accent px-1.5 text-[10px] font-bold text-white ${
              mobile ? 'right-[calc(50%-18px)] top-1' : 'right-2 top-2 xl:static xl:ml-auto'
            } ${active && !mobile ? 'bg-white/25' : ''}`}
          >
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-pos-bg text-neutral-900" style={themeStyle}>
      {/* Sidebar */}
      <nav className="hidden w-[76px] shrink-0 flex-col bg-pos-sidebar p-3 text-white md:flex xl:w-60 xl:p-4">
        <div className="mb-6 flex items-center gap-3 px-1 pt-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-pos-accent text-lg font-black">K</div>
          <div className="hidden min-w-0 xl:block">
            <p className="truncate text-base font-bold leading-tight">Kuik</p>
            <p className="text-[11px] uppercase tracking-widest text-neutral-400">POS{demo ? ` · ${t('demoBadge')}` : ''}</p>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {navItems.map((item) => renderNav(item))}
        </div>
        <div className="mt-4 flex flex-col gap-1 border-t border-white/10 pt-4">
          <button
            data-help="pos_customerScreen"
            onClick={launchCustomerScreen}
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-neutral-300 hover:bg-white/5 hover:text-white xl:px-4"
            title={t('customerScreen')}
          >
            <MonitorSmartphone className="h-5 w-5 shrink-0" />
            <span className="hidden xl:inline">{t('customerScreen')}</span>
          </button>
          <Link
            href="/kds"
            target="_blank"
            data-help="pos_kitchen"
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-neutral-300 hover:bg-white/5 hover:text-white xl:px-4"
            title={t('kitchen')}
          >
            <ChefHat className="h-5 w-5 shrink-0" />
            <span className="hidden xl:inline">{t('kitchen')}</span>
          </Link>
          <Link
            href="/ordering"
            target="_blank"
            data-help="pos_settings"
            className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-neutral-300 hover:bg-white/5 hover:text-white xl:px-4"
            title={t('settings')}
          >
            <Settings className="h-5 w-5 shrink-0" />
            <span className="hidden xl:inline">{t('settings')}</span>
          </Link>
        </div>
        <button
          onClick={() => {
            setField(serverName);
            setModal('server');
          }}
          data-help="pos_server"
          className="mt-auto flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2 text-left hover:bg-white/10 xl:p-3"
          title={t('selectServer')}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pos-accent/30 text-xs font-bold text-white/70">
            {initials}
          </span>
          <span className="hidden min-w-0 flex-1 xl:block">
            <span className="block truncate text-sm font-semibold">{serverName || t('noServer')}</span>
            <span className="block text-xs text-neutral-400">{t('cashier')}</span>
          </span>
          <ChevronDown className="hidden h-4 w-4 text-neutral-400 xl:block" />
        </button>
      </nav>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 px-3 pt-3 pb-2 md:px-4">
          <div className="relative min-w-0 flex-1" data-help="pos_search">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (view !== 'sale') setView('sale');
              }}
              onFocus={() => view !== 'sale' && setView('sale')}
              placeholder={t('searchProducts')}
              className="h-11 w-full rounded-2xl border border-neutral-200 bg-white pl-10 pr-14 text-sm shadow-sm focus:border-pos-accent focus:outline-none focus:ring-2 focus:ring-pos-accent/20"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 text-[11px] font-medium text-neutral-400 sm:block">
              ⌘K
            </kbd>
          </div>

          {selected && selected.status !== 'paid' && (
            <button
              data-help="pos_hold"
              onClick={holdSale}
              className="hidden h-11 items-center gap-2 rounded-2xl border border-neutral-200 bg-white px-3.5 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50 sm:flex"
            >
              <PauseCircle className="h-4 w-4" /> <span className="hidden lg:inline">{t('hold')}</span>
            </button>
          )}
          <button
            data-help="pos_newSale"
            onClick={newSale}
            className="flex h-11 items-center gap-2 rounded-2xl bg-pos-accent px-3.5 text-sm font-semibold text-white shadow-sm shadow-pos-accent/30 hover:bg-pos-accent-hover"
          >
            <Plus className="h-4 w-4" /> <span className="hidden lg:inline">{t('newSale')}</span>
          </button>

          <button
            data-help="pos_registerChip"
            onClick={() => setView('register')}
            className={`hidden h-11 items-center gap-2 rounded-2xl border bg-white px-3 text-xs font-semibold shadow-sm md:flex ${
              shift ? 'border-green-200 text-green-700' : 'border-amber-200 text-amber-700'
            }`}
            title={t('register')}
          >
            <span className={`h-2 w-2 rounded-full ${shift ? 'bg-green-500' : 'bg-amber-500'}`} />
            <span className="hidden lg:inline">{shift ? t('registerOpenShort') : t('registerClosed')}</span>
          </button>

          <div className="relative">
            <button
              data-help="pos_bell"
              onClick={() => setBell((v) => !v)}
              className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-600 shadow-sm hover:bg-neutral-50"
              title={t('notifications')}
            >
              <Bell className="h-4 w-4" />
              {(sync.pending > 0 || failed > 0 || !sync.online) && (
                <span
                  className={`absolute -right-1 -top-1 min-w-[18px] rounded-full px-1 text-[10px] font-bold text-white ${
                    failed > 0 || !sync.online ? 'bg-red-500' : 'bg-pos-accent'
                  }`}
                >
                  {failed > 0 ? failed : sync.pending > 0 ? sync.pending : '!'}
                </span>
              )}
            </button>
            {bell && (
              <div className="animate-fade absolute right-0 top-12 z-30 w-64 rounded-2xl border border-neutral-200 bg-white p-3 text-sm shadow-xl">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t('notifications')}</p>
                <p className="flex items-center gap-2 py-1">
                  {sync.online ? <Wifi className="h-4 w-4 text-green-600" /> : <WifiOff className="h-4 w-4 text-red-500" />}
                  {sync.online ? t('online') : t('offline')}
                </p>
                <p className="flex items-center gap-2 py-1 text-neutral-600">
                  {sync.pending > 0 ? (
                    <>
                      <CloudUpload className="h-4 w-4 text-amber-500" /> {t('pending', { n: sync.pending })}
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4 text-green-600" /> {t('synced')}
                    </>
                  )}
                </p>
                {failed > 0 && (
                  <div className="mt-1 flex items-center justify-between gap-2 rounded-xl bg-red-50 px-2 py-1.5 text-red-700">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" /> {t('syncErrors', { n: failed })}
                    </span>
                    <button onClick={() => retryDead(db)} className="rounded-lg border border-red-300 px-2 py-0.5 text-xs font-medium">
                      {t('retry')}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            data-help="pos_fullscreen"
            onClick={toggleFullscreen}
            className="hidden h-11 w-11 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-neutral-600 shadow-sm hover:bg-neutral-50 sm:flex"
            title={t('fullscreen')}
          >
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </header>

        {/* Content */}
        <div className="flex min-h-0 flex-1">
          {view === 'sale' && (
            <SaleScreen
              db={db}
              tab={selected}
              items={live}
              openTabs={tabs ?? []}
              menu={menu}
              tenantId={tenantId}
              userId={userId}
              shiftId={shiftId}
              restaurantName={restaurantName}
              currency={currency}
              locale={locale}
              query={query}
              onFocusSearch={() => searchRef.current?.focus()}
              ensureTab={ensureTab}
              onSelectTab={select}
              onHold={holdSale}
              onPayPhase={setPayPhase}
              onPaid={() => select(null)}
              onVoided={() => select(null)}
              posTables={posTables}
              floorTables={floorTables}
            />
          )}

          {view === 'tables' && (
            <section className="flex-1 overflow-y-auto p-3 md:p-4">
              {(floorTables.length > 0
                ? [...new Set(floorTables.map((x) => x.area ?? ''))].map((area) => ({
                    title: area || (floorTables.some((x) => x.area) ? t('noArea') : t('tables')),
                    labels: floorTables.filter((x) => (x.area ?? '') === area).map((x) => ({ label: x.label, seats: x.seats })),
                  }))
                : [{ title: t('tables'), labels: Array.from({ length: posTables }, (_, i) => ({ label: String(i + 1), seats: 0 })) }]
              ).map((group) => (
                <div key={group.title} className="mb-5">
                  <h2 className="mb-3 text-lg font-bold">{group.title}</h2>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                    {group.labels.map(({ label, seats }) => {
                      const tab = (tabs ?? []).find((x) => x.table_label === label);
                      return (
                        <button
                          key={label}
                          data-help="pos_tableCard"
                          onClick={() => tapTable(label)}
                          className={`flex aspect-square flex-col items-center justify-center rounded-2xl p-2 text-center shadow-sm ring-1 transition active:scale-[0.97] ${
                            tab ? 'bg-pos-accent text-pos-accent-text ring-pos-accent' : 'bg-white text-neutral-900 ring-black/5 hover:shadow-md'
                          }`}
                        >
                          <span className="text-xl font-bold">{label}</span>
                          {tab ? (
                            <>
                              <span className="text-xs font-semibold">{money(tab.total)}</span>
                              {tab.server_name && <span className="text-[10px] opacity-70">{tab.server_name}</span>}
                            </>
                          ) : (
                            <span className="text-xs text-neutral-400">{seats ? `${seats} · ${t('free')}` : t('free')}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          )}

          {view === 'orders' && (
            <section className="flex-1 overflow-y-auto p-3 md:p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold">
                  {t('accounts')} <span className="text-sm font-normal text-neutral-400">{t('openTabsCount', { n: openCount })}</span>
                </h2>
                <button
                  data-help="pos_newTab"
                  onClick={() => openModal('newTab')}
                  className="flex items-center gap-1.5 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" /> {t('newTab')}
                </button>
              </div>
              {openCount === 0 ? (
                <p className="py-12 text-center text-neutral-400">{t('noTabs')}</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {(tabs ?? []).map((tab) => (
                    <button
                      key={tab.id}
                      data-help="pos_tabCard"
                      onClick={() => select(tab.id)}
                      className={`rounded-2xl bg-white p-4 text-left shadow-sm ring-1 transition hover:shadow-md ${
                        tab.id === selectedId ? 'ring-2 ring-pos-accent' : 'ring-black/5'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-semibold">{tab.table_label || tab.customer_name || t('tab')}</span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            tab.status === 'held' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {tab.status === 'held' ? t('held') : t('open')}
                        </span>
                      </div>
                      <p className="mt-3 text-lg font-bold">{money(tab.total)}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
                        <Clock className="h-3 w-3" />
                        {new Date(tab.opened_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        {tab.server_name ? ` · ${tab.server_name}` : ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {view === 'history' && (
            <section className="flex-1 overflow-y-auto">
              <HistoryScreen
                db={db}
                shiftId={shiftId}
                restaurantName={restaurantName}
                currency={currency}
                locale={locale}
                onBack={() => setView('sale')}
              />
            </section>
          )}

          {view === 'register' && (
            <section className="flex-1 overflow-y-auto p-3 md:p-4">
              <div className="grid max-w-3xl gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="mb-4 flex items-center gap-3">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${shift ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                      <Wallet className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="font-bold">{t('register')}</h2>
                      <p className="text-sm text-neutral-500">
                        {shift ? t('registerOpen', { x: money((shift as RegisterShift).opening_cash) }) : t('registerClosed')}
                      </p>
                    </div>
                  </div>
                  <button
                    data-help="pos_registerButton"
                    onClick={() => openModal(shift ? 'closeReg' : 'openReg')}
                    className={shift ? 'w-full rounded-xl border border-amber-300 py-3 font-semibold text-amber-700 hover:bg-amber-50' : PRIMARY}
                  >
                    {shift ? t('closeRegister') : t('openRegister')}
                  </button>
                  {shift && (
                    <p className="mt-3 flex items-center gap-1 text-xs text-neutral-400">
                      <Clock className="h-3 w-3" />
                      {t('openedAt', { x: new Date((shift as RegisterShift).opened_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-black/5">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pos-accent-soft text-pos-accent">
                      <MonitorSmartphone className="h-5 w-5" />
                    </span>
                    <div>
                      <h2 className="font-bold">{t('customerScreen')}</h2>
                      <p className="text-sm text-neutral-500">{t('customerScreenHint')}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button data-help="pos_openCustomer" onClick={launchCustomerScreen} className={PRIMARY}>
                      {t('openCustomerScreen')}
                    </button>
                    {canPresent() && (
                      <button
                        onClick={castCustomerScreen}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 py-3 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                      >
                        <Cast className="h-4 w-4" /> {t('present')}
                      </button>
                    )}
                    <a
                      href={customerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-center gap-1.5 py-1 text-xs text-neutral-500 hover:text-neutral-900"
                    >
                      <ExternalLink className="h-3 w-3" /> {customerUrl}
                    </a>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Mobile nav */}
        <nav className="flex border-t border-neutral-200 bg-white md:hidden">
          {navItems.map((item) => renderNav(item, true))}
        </nav>
      </div>

      {toast && (
        <div className="animate-slide-up fixed bottom-20 left-1/2 z-[70] max-w-sm -translate-x-1/2 rounded-2xl bg-neutral-900 px-4 py-3 text-center text-sm text-white shadow-xl md:bottom-6">
          {toast}
        </div>
      )}

      {modal === 'newTab' && (
        <PosModal title={t('newTab')} onClose={() => setModal(null)}>
          <input
            autoFocus
            value={field}
            onChange={(e) => setField(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmNewTab()}
            placeholder={t('tableLabelPh')}
            className={`${INPUT} mb-4`}
          />
          <button onClick={confirmNewTab} className={PRIMARY}>
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
            className={`${INPUT} mb-4`}
          />
          <button onClick={saveServer} className={PRIMARY}>
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
            className={`${INPUT} mb-4`}
          />
          <button onClick={confirmOpenReg} className={PRIMARY}>
            {t('openRegister')}
          </button>
        </PosModal>
      )}

      {modal === 'closeReg' && (
        <PosModal title={cashCountMode === 'denominations' ? t('denomTitle') : t('closeRegister')} onClose={() => setModal(null)}>
          {cashCountMode === 'denominations' ? (
            <DenomCount onTotal={(tot) => setField(String(tot))} currency={currency} locale={locale} denoms={cashDenominations ?? undefined} />
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
                className={INPUT}
              />
            </>
          )}
          <button onClick={confirmCloseReg} className={`${PRIMARY} mt-4`}>
            {t('closeRegister')}
          </button>
        </PosModal>
      )}

      {zShift && <ZReport db={db} shift={zShift} currency={currency} locale={locale} onClose={() => setZShift(null)} />}
      {demo && <ExplainLayer initialOn={explain} />}
    </div>
  );
}
