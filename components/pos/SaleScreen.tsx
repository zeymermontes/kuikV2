'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useLiveQuery } from 'dexie-react-hooks';
import { useTranslations } from 'next-intl';
import {
  Plus,
  Minus,
  Trash2,
  UtensilsCrossed,
  Percent,
  Users,
  Ban,
  Pencil,
  Star,
  ScanBarcode,
  UserRound,
  ChefHat,
  MoreHorizontal,
  X,
  ShoppingBag,
  PauseCircle,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  ChevronRight,
  LayoutGrid,
} from 'lucide-react';
import type { PosDexie } from '@/lib/pos/db';
import type { PosTab, PosMenu, TabItem, PaymentMethod } from '@/lib/pos/types';
import { addLineToTab, setItemQty, voidItem, setDiscount, setGuests, voidTab } from '@/lib/pos/tabs';
import { enqueueUpsert } from '@/lib/pos/sync';
import { fireToKitchen } from '@/lib/pos/kitchen';
import { hasOptions } from '@/lib/menu-options';
import { PosModal } from './PosModal';
import { formatPrice } from '@/lib/utils';
import type { Product } from '@/lib/database.types';
import { ProductSheet } from '@/components/menu/ProductSheet';
import { PaymentSheet } from './PaymentSheet';

/** What the payment sheet is doing, mirrored to the customer screen. */
export interface PayPhase {
  phase: 'sale' | 'paying' | 'paid';
  due?: number;
  paid?: number;
  change?: number;
  method?: string;
  tip?: number;
  total?: number;
}

const ALL = '__all__';
const POPULAR = '__popular__';
const DISCOUNT_PRESETS = [10, 15, 20, 50];
const INPUT = 'w-full rounded-xl border border-neutral-200 px-3 py-3 text-base focus:border-pos-accent focus:outline-none';
const PRIMARY = 'w-full rounded-xl bg-pos-accent py-3 font-semibold text-white hover:bg-pos-accent-hover';

export function SaleScreen({
  db,
  tab,
  items,
  openTabs,
  menu,
  tenantId,
  userId,
  shiftId,
  restaurantName,
  currency,
  locale,
  query,
  onFocusSearch,
  ensureTab,
  onSelectTab,
  onHold,
  onPayPhase,
  onPaid,
  onVoided,
  posTables,
  floorLabels = [],
}: {
  db: PosDexie;
  /** The sale being built; null until the first product is tapped. */
  tab: PosTab | null;
  /** Live (non-voided) lines of `tab`. */
  items: TabItem[];
  openTabs: PosTab[];
  menu: PosMenu;
  tenantId: string;
  userId: string;
  shiftId: string | null;
  restaurantName: string;
  currency: string;
  locale: string;
  query: string;
  onFocusSearch: () => void;
  ensureTab: () => Promise<PosTab>;
  onSelectTab: (id: string) => void;
  onHold: () => void;
  onPayPhase: (p: PayPhase | null) => void;
  onPaid: () => void;
  onVoided: () => void;
  /** Numbered tables on the floor map; 0 = free-text labels only. */
  posTables: number;
  /** Host-stand floor plan labels, when the restaurant drew one. */
  floorLabels?: string[];
}) {
  const t = useTranslations('pos');
  const money = (n: number) => formatPrice(n, currency, locale);
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [sheetProduct, setSheetProduct] = useState<Product | null>(null);
  const [editItem, setEditItem] = useState<TabItem | null>(null);
  const [pay, setPay] = useState<PaymentMethod | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<'discount' | 'guests' | 'void' | 'customer' | 'table' | null>(null);
  const [field, setField] = useState('');
  const [pctMode, setPctMode] = useState(false);

  const live = items;
  const subtotal = live.reduce((s, i) => s + i.line_total, 0);
  const unfired = live.filter((i) => !i.fired_at);
  const count = live.reduce((s, i) => s + i.qty, 0);
  const total = tab ? Math.max(0, subtotal - tab.discount) : 0;

  // A paid sale keeps its lines on screen until the cashier dismisses the receipt.
  const paid = tab?.status === 'paid';

  function feedback() {
    try {
      navigator.vibrate?.(10);
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctx();
      const o = ctx.createOscillator();
      o.frequency.value = 660;
      o.connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.05);
    } catch {
      // best effort
    }
  }

  // Most-ordered products (across all tabs) power the "Popular" quick tab.
  const allItems = useLiveQuery(() => db.tab_items.toArray(), [db], [] as TabItem[]);
  const popular = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of allItems ?? []) if (it.product_id && !it.voided_at) counts.set(it.product_id, (counts.get(it.product_id) ?? 0) + it.qty);
    const byId = new Map(menu.products.map((p) => [p.id, p] as const));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => byId.get(id))
      .filter((p): p is Product => !!p && p.is_available)
      .slice(0, 12);
  }, [allItems, menu.products]);

  const catName = useMemo(() => {
    const m = new Map(menu.categories.map((c) => [c.id, c.name] as const));
    return (id: string) => m.get(id) ?? '';
  }, [menu.categories]);

  const products = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) return menu.products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q));
    if (activeCat === POPULAR) return popular;
    if (activeCat === ALL) return menu.products;
    return menu.products.filter((p) => p.category_id === activeCat);
  }, [menu.products, activeCat, query, popular]);

  // Map a product to its kitchen station (category.station, else category name).
  const stationOf = useMemo(() => {
    const catById = new Map(menu.categories.map((c) => [c.id, c]));
    const prodById = new Map(menu.products.map((p) => [p.id, p]));
    return (productId: string | null) => {
      const cat = productId ? catById.get(prodById.get(productId)?.category_id ?? '') : undefined;
      return cat?.station || cat?.name || 'Cocina';
    };
  }, [menu.categories, menu.products]);

  async function tapProduct(p: Product) {
    if (!p.is_available || paid) return;
    if (hasOptions(p)) {
      setSheetProduct(p);
      return;
    }
    feedback();
    const target = await ensureTab();
    await addLineToTab(db, tenantId, target.id, { key: p.id, productId: p.id, name: p.name, basePrice: p.price, selections: [], qty: 1 });
  }

  // Barcode scanner / Enter in the search box: a single match is added straight away.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement) || !query.trim()) return;
      if (products.length === 1) tapProduct(products[0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, products]);

  async function applyDiscount() {
    if (!tab) return;
    const v = Number(field) || 0;
    await setDiscount(db, tab, pctMode ? Math.round(tab.subtotal * v) / 100 : v);
    setModal(null);
  }
  async function applyGuests() {
    if (!tab) return;
    await setGuests(db, tab, Number(field) || 1);
    setModal(null);
  }
  async function applyTable(label = field) {
    if (!tab) return;
    await enqueueUpsert(db, 'tabs', { ...tab, table_label: label.trim() || null });
    setModal(null);
  }
  async function applyCustomer() {
    if (!tab) return;
    await enqueueUpsert(db, 'tabs', { ...tab, customer_name: field.trim() || null });
    setModal(null);
  }
  async function applyVoid() {
    if (!tab) return;
    await voidTab(db, tab, field.trim() || null);
    setModal(null);
    onVoided();
  }
  function openTabModal(kind: 'discount' | 'guests' | 'void' | 'customer' | 'table') {
    if (!tab) return;
    setField(kind === 'guests' ? String(tab.guests) : kind === 'customer' ? (tab.customer_name ?? '') : kind === 'table' ? (tab.table_label ?? '') : '');
    setPctMode(false);
    setMenuOpen(false);
    setModal(kind);
  }
  function fire() {
    if (tab) fireToKitchen(db, tenantId, userId, tab, live, stationOf);
  }
  function startPay(method: PaymentMethod) {
    if (!tab || live.length === 0 || !shiftId) return;
    setCartOpen(false);
    setPay(method);
  }

  const canCharge = !!tab && live.length > 0 && !!shiftId && !paid;
  const otherTabs = openTabs.filter((x) => x.id !== tab?.id);

  // ── Cart panel (right column on wide screens, a sheet below) ──────────────
  const panel = (
    <div className="flex h-full w-full flex-col">
      <header className="flex items-center gap-2 border-b border-neutral-100 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-bold">
            {t('currentSale')}
            {count > 0 && <span className="text-neutral-400">({count})</span>}
          </h2>
          {tab && (
            <button
              onClick={() => !paid && openTabModal('table')}
              className="block max-w-full truncate text-left text-xs text-neutral-400 hover:text-neutral-700"
              title={t('table')}
            >
              {[tab.table_label ? `${t('tableShort')} ${tab.table_label}` : t('noTable'), tab.customer_name, tab.guests > 1 && `${tab.guests} ${t('guests').toLowerCase()}`, tab.status === 'held' && t('held')]
                .filter(Boolean)
                .join(' · ')}
            </button>
          )}
        </div>
        {tab && !paid && (
          <div className="relative">
            <button data-help="pos_saleMenu" onClick={() => setMenuOpen((v) => !v)} className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100" title={t('more')}>
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menuOpen && (
              <div className="animate-fade absolute right-0 top-10 z-20 w-48 overflow-hidden rounded-2xl border border-neutral-200 bg-white py-1 text-sm shadow-xl">
                <MenuItem icon={Percent} label={t('discount')} onClick={() => openTabModal('discount')} />
                <MenuItem icon={UserRound} label={t('customer')} onClick={() => openTabModal('customer')} />
                <MenuItem icon={LayoutGrid} label={t('table')} onClick={() => openTabModal('table')} />
                <MenuItem icon={Users} label={t('guests')} onClick={() => openTabModal('guests')} />
                <MenuItem
                  icon={PauseCircle}
                  label={t('hold')}
                  onClick={() => {
                    setMenuOpen(false);
                    setCartOpen(false);
                    onHold();
                  }}
                />
                <MenuItem icon={Ban} label={t('voidTab')} danger onClick={() => openTabModal('void')} />
              </div>
            )}
          </div>
        )}
        <button onClick={() => setCartOpen(false)} className="rounded-xl p-2 text-neutral-500 hover:bg-neutral-100 lg:hidden" aria-label={t('close')}>
          <X className="h-5 w-5" />
        </button>
      </header>

      {otherTabs.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto border-b border-neutral-100 px-3 py-2">
          {otherTabs.map((x) => (
            <button
              key={x.id}
              data-help="pos_switchTab"
              onClick={() => {
                setCartOpen(false);
                onSelectTab(x.id);
              }}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${
                x.status === 'held' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-neutral-200 bg-white text-neutral-600'
              }`}
              title={t('switchSale')}
            >
              {x.table_label ? `${t('tableShort')} ${x.table_label}` : x.customer_name || t('tab')}
              <span className="text-neutral-400">{money(x.total)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {!tab || live.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-12 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pos-accent-soft text-pos-accent">
              <ShoppingBag className="h-7 w-7" />
            </span>
            <p className="font-semibold">{t('noSale')}</p>
            <p className="max-w-[220px] text-xs text-neutral-400">{t('noSaleHint')}</p>
          </div>
        ) : (
          live.map((it) => {
            const prod = menu.products.find((p) => p.id === it.product_id);
            return (
              <div key={it.id} className="flex gap-3 border-b border-neutral-100 py-3" data-help="pos_line">
                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                  {prod?.image_url ? (
                    <Image src={prod.image_url} alt={it.name} fill sizes="56px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-neutral-300">
                      <UtensilsCrossed className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{it.name}</p>
                    {!paid && (
                      <button data-help="pos_remove" onClick={() => voidItem(db, it)} className="shrink-0 p-0.5 text-neutral-300 hover:text-red-500" title={t('remove')}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {(it.selections.length > 0 || it.note) && (
                    <p className="truncate text-xs text-neutral-400">{[...it.selections.map((s) => s.name), it.note].filter(Boolean).join(', ')}</p>
                  )}
                  <div className="mt-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1 rounded-full border border-neutral-200 px-1 py-0.5" data-help="pos_qty">
                      <button onClick={() => !paid && setItemQty(db, it, it.qty - 1)} className="rounded-full p-1 hover:bg-neutral-100" disabled={paid}>
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="min-w-5 text-center text-sm font-semibold tabular-nums">{it.qty}</span>
                      <button onClick={() => !paid && setItemQty(db, it, it.qty + 1)} className="rounded-full p-1 hover:bg-neutral-100" disabled={paid}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                      {prod && !paid && (
                        <button onClick={() => setEditItem(it)} className="rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-800" title={t('editItem')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <span className="text-sm font-bold tabular-nums">
                      {money(it.line_total)}
                      {it.fired_at && <span className="ml-1.5 text-[10px] font-semibold text-green-600">{t('fired')}</span>}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <footer className="border-t border-neutral-100 px-4 py-3">
        <div className="space-y-1 text-sm text-neutral-500" data-help="pos_totals">
          <div className="flex justify-between">
            <span>{t('subtotal')}</span>
            <span className="tabular-nums">{money(subtotal)}</span>
          </div>
          {tab && tab.discount > 0 && (
            <div className="flex justify-between text-pos-accent">
              <span>{t('discount')}</span>
              <span className="tabular-nums">− {money(tab.discount)}</span>
            </div>
          )}
          {tab && tab.tip > 0 && (
            <div className="flex justify-between">
              <span>{t('tip')}</span>
              <span className="tabular-nums">{money(tab.tip)}</span>
            </div>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="text-lg font-bold">{t('total')}</span>
          <span className="text-2xl font-extrabold tabular-nums">{money(total + (tab?.tip ?? 0))}</span>
        </div>

        {unfired.length > 0 && !paid && (
          <button
            data-help="pos_fire"
            onClick={fire}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-neutral-200 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <ChefHat className="h-4 w-4" /> {t('fireKitchen')} ({unfired.length})
          </button>
        )}

        <button
          data-help="pos_checkout"
          onClick={() => startPay('cash')}
          disabled={!canCharge}
          className="mt-3 flex w-full items-center justify-between rounded-2xl bg-pos-accent px-5 py-3.5 font-semibold text-white shadow-lg shadow-pos-accent/30 transition hover:bg-pos-accent-hover disabled:opacity-40 disabled:shadow-none"
        >
          <span>{t('checkout')}</span>
          <span className="tabular-nums">{money(total)}</span>
        </button>
        {tab && !shiftId && !paid && <p className="mt-2 text-center text-xs text-amber-600">{t('openRegisterFirst')}</p>}

        <div className="mt-2 grid grid-cols-4 gap-2">
          <PayButton icon={Banknote} label={t('method_cash')} onClick={() => startPay('cash')} disabled={!canCharge} />
          <PayButton icon={CreditCard} label={t('method_card')} onClick={() => startPay('card')} disabled={!canCharge} />
          <PayButton icon={ArrowLeftRight} label={t('method_transfer')} onClick={() => startPay('transfer')} disabled={!canCharge} />
          <PayButton icon={MoreHorizontal} label={t('more')} onClick={() => startPay('other')} disabled={!canCharge} />
        </div>
      </footer>
    </div>
  );

  return (
    <div className="flex min-w-0 flex-1">
      {/* Products */}
      <section className="relative flex min-w-0 flex-1 flex-col">
        <div className={`no-scrollbar flex items-center gap-2 overflow-x-auto px-3 pb-2 pt-1 md:px-4 ${query ? 'invisible h-0 overflow-hidden py-0' : ''}`}>
          <Chip active={activeCat === ALL} onClick={() => setActiveCat(ALL)} help="pos_category">
            {t('all')}
          </Chip>
          {popular.length > 0 && (
            <Chip active={activeCat === POPULAR} onClick={() => setActiveCat(POPULAR)} help="pos_popular">
              <Star className="h-3.5 w-3.5" /> {t('popular')}
            </Chip>
          )}
          {menu.categories.map((c) => (
            <Chip key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} help="pos_category">
              {c.name}
            </Chip>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 md:px-4 lg:pb-4">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
            {products.map((p) => (
              <button
                key={p.id}
                data-help="pos_product"
                onClick={() => tapProduct(p)}
                disabled={!p.is_available || paid}
                className="group flex flex-col rounded-2xl bg-white p-2.5 text-left shadow-sm ring-1 ring-black/5 transition hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-neutral-100">
                  {p.image_url ? (
                    <Image src={p.image_url} alt={p.name} fill sizes="(min-width:1024px) 16vw, 30vw" className="object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-neutral-300">
                      <UtensilsCrossed className="h-8 w-8" />
                    </div>
                  )}
                  {hasOptions(p) && (
                    <span className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-pos-accent text-pos-accent-text shadow">
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
                <p className="mt-2.5 line-clamp-2 text-sm font-semibold leading-tight">{p.name}</p>
                <div className="mt-1 flex items-end justify-between gap-1">
                  {p.price != null ? <p className="text-sm font-bold tabular-nums">{money(p.price)}</p> : <span />}
                  {!p.is_available ? (
                    <span className="text-[11px] font-semibold text-red-500">{t('soldOut')}</span>
                  ) : (
                    <span className="truncate text-[11px] text-neutral-400">{catName(p.category_id)}</span>
                  )}
                </div>
              </button>
            ))}
            {products.length === 0 && <p className="col-span-full py-16 text-center text-sm text-neutral-400">{t('noProducts')}</p>}
          </div>
        </div>

        {/* Desktop quick actions */}
        <div className="hidden gap-2 px-4 pb-4 lg:flex">
          <Action icon={ScanBarcode} label={t('scan')} onClick={onFocusSearch} accent help="pos_scan" />
          <Action icon={Percent} label={t('discount')} onClick={() => openTabModal('discount')} disabled={!tab || paid} help="pos_discount" />
          <Action icon={UserRound} label={t('customer')} onClick={() => openTabModal('customer')} disabled={!tab || paid} help="pos_customer" />
          <Action icon={LayoutGrid} label={t('table')} onClick={() => openTabModal('table')} disabled={!tab || paid} help="pos_table" />
          <Action icon={Users} label={t('guests')} onClick={() => openTabModal('guests')} disabled={!tab || paid} help="pos_guests" />
          <Action icon={Ban} label={t('void')} onClick={() => openTabModal('void')} disabled={!tab || paid} help="pos_void" />
        </div>

        {/* Mobile / tablet: floating sale bar */}
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3 lg:hidden">
          <button
            data-help="pos_cartBar"
            onClick={() => setCartOpen(true)}
            className="pointer-events-auto flex w-full max-w-md items-center justify-between rounded-2xl bg-pos-accent px-4 py-3 text-white shadow-xl shadow-pos-accent/40"
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <ShoppingBag className="h-5 w-5" />
              {count > 0 ? t('items', { n: count }) : t('viewSale')}
            </span>
            <span className="flex items-center gap-1 font-bold tabular-nums">
              {money(total)} <ChevronRight className="h-4 w-4" />
            </span>
          </button>
        </div>
      </section>

      {/* Current sale — column on lg+, sheet below */}
      <aside className="hidden w-[350px] shrink-0 border-l border-neutral-200 bg-white lg:flex xl:w-[390px]">{panel}</aside>
      {cartOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="animate-fade absolute inset-0 bg-black/40" onClick={() => setCartOpen(false)} />
          <div className="animate-slide-up absolute inset-x-0 bottom-0 h-[88dvh] overflow-hidden rounded-t-3xl bg-white shadow-2xl md:inset-y-0 md:left-auto md:right-0 md:h-auto md:w-[400px] md:rounded-none">
            {panel}
          </div>
        </div>
      )}

      {sheetProduct && (
        <ProductSheet
          product={sheetProduct}
          showPrice
          currency={currency}
          locale={locale}
          onClose={() => setSheetProduct(null)}
          onConfirm={async (line) => {
            const target = await ensureTab();
            await addLineToTab(db, tenantId, target.id, line);
          }}
        />
      )}

      {editItem &&
        tab &&
        (() => {
          const prod = menu.products.find((p) => p.id === editItem.product_id);
          if (!prod) return null;
          return (
            <ProductSheet
              product={prod}
              showPrice
              currency={currency}
              locale={locale}
              initial={{ qty: editItem.qty, note: editItem.note, selections: editItem.selections }}
              onClose={() => setEditItem(null)}
              onConfirm={async (line) => {
                await voidItem(db, editItem);
                await addLineToTab(db, tenantId, tab.id, line);
              }}
            />
          );
        })()}

      {pay && tab && (
        <PaymentSheet
          db={db}
          tab={tab}
          tenantId={tenantId}
          userId={userId}
          shiftId={shiftId}
          restaurantName={restaurantName}
          currency={currency}
          locale={locale}
          initialMethod={pay}
          onPhase={onPayPhase}
          onClose={() => setPay(null)}
          onPaid={() => {
            setPay(null);
            onPaid();
          }}
          onFire={fire}
        />
      )}

      {modal === 'discount' && tab && (
        <PosModal title={t('discount')} onClose={() => setModal(null)}>
          <div className="mb-3 flex overflow-hidden rounded-xl border border-neutral-200 text-sm">
            <button onClick={() => setPctMode(false)} className={`flex-1 py-2 font-medium ${!pctMode ? 'bg-pos-accent text-pos-accent-text' : 'text-neutral-600'}`}>
              {currency}
            </button>
            <button onClick={() => setPctMode(true)} className={`flex-1 py-2 font-medium ${pctMode ? 'bg-pos-accent text-pos-accent-text' : 'text-neutral-600'}`}>
              {t('pct')}
            </button>
          </div>
          <input
            autoFocus
            type="number"
            inputMode="decimal"
            value={field}
            onChange={(e) => setField(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyDiscount()}
            placeholder="0"
            className={`${INPUT} mb-3`}
          />
          <div className="mb-4 flex flex-wrap gap-2">
            {DISCOUNT_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => {
                  setPctMode(true);
                  setField(String(p));
                }}
                className="rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-200"
              >
                {p}%
              </button>
            ))}
            <button
              onClick={() => {
                setPctMode(true);
                setField('100');
              }}
              className="rounded-full bg-neutral-100 px-3 py-1.5 text-sm font-medium hover:bg-neutral-200"
            >
              {t('comp')}
            </button>
          </div>
          <button onClick={applyDiscount} className={PRIMARY}>
            {t('apply')}
          </button>
        </PosModal>
      )}

      {modal === 'guests' && (
        <PosModal title={t('guests')} onClose={() => setModal(null)}>
          <input
            autoFocus
            type="number"
            inputMode="numeric"
            value={field}
            onChange={(e) => setField(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyGuests()}
            className={`${INPUT} mb-4`}
          />
          <button onClick={applyGuests} className={PRIMARY}>
            {t('apply')}
          </button>
        </PosModal>
      )}

      {modal === 'table' && tab && (
        <PosModal title={t('table')} onClose={() => setModal(null)}>
          {(posTables > 0 || floorLabels.length > 0) && (
            <div className="mb-3 grid max-h-56 grid-cols-5 gap-2 overflow-y-auto">
              {(floorLabels.length > 0 ? floorLabels : Array.from({ length: posTables }, (_, i) => String(i + 1))).map((label) => {
                const taken = openTabs.find((x) => x.table_label === label && x.id !== tab.id);
                const current = tab.table_label === label;
                return (
                  <button
                    key={label}
                    onClick={() => applyTable(label)}
                    disabled={!!taken}
                    className={`aspect-square rounded-xl text-sm font-bold ring-1 ring-black/5 disabled:opacity-30 ${
                      current ? 'bg-pos-accent text-pos-accent-text' : 'bg-neutral-100 hover:bg-neutral-200'
                    }`}
                    title={taken ? t('tableTaken') : undefined}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
          <input
            autoFocus={posTables === 0 && floorLabels.length === 0}
            value={field}
            onChange={(e) => setField(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyTable()}
            placeholder={t('tableLabelPh')}
            className={`${INPUT} mb-4`}
          />
          <div className="flex gap-2">
            {tab.table_label && (
              <button onClick={() => applyTable('')} className="flex-1 rounded-xl border border-neutral-200 py-3 font-semibold text-neutral-600 hover:bg-neutral-50">
                {t('clearTable')}
              </button>
            )}
            <button onClick={() => applyTable()} className={`${PRIMARY} flex-1`}>
              {t('apply')}
            </button>
          </div>
        </PosModal>
      )}

      {modal === 'customer' && (
        <PosModal title={t('customer')} onClose={() => setModal(null)}>
          <input
            autoFocus
            value={field}
            onChange={(e) => setField(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyCustomer()}
            placeholder={t('customerPh')}
            className={`${INPUT} mb-4`}
          />
          <button onClick={applyCustomer} className={PRIMARY}>
            {t('apply')}
          </button>
        </PosModal>
      )}

      {modal === 'void' && (
        <PosModal title={t('voidTab')} onClose={() => setModal(null)}>
          <input
            autoFocus
            value={field}
            onChange={(e) => setField(e.target.value)}
            placeholder={t('voidReason')}
            className={`${INPUT} mb-4`}
          />
          <button onClick={applyVoid} className="w-full rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500">
            {t('voidTab')}
          </button>
        </PosModal>
      )}
    </div>
  );
}

function Chip({ active, onClick, children, help }: { active: boolean; onClick: () => void; children: React.ReactNode; help?: string }) {
  return (
    <button
      data-help={help}
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
        active ? 'bg-pos-accent text-pos-accent-text shadow-sm shadow-pos-accent/30' : 'bg-white text-neutral-600 ring-1 ring-black/5 hover:bg-neutral-50'
      }`}
    >
      {children}
    </button>
  );
}

function Action({
  icon: Icon,
  label,
  onClick,
  accent,
  disabled,
  help,
}: {
  icon: typeof Percent;
  label: string;
  onClick: () => void;
  accent?: boolean;
  disabled?: boolean;
  help?: string;
}) {
  return (
    <button
      data-help={help}
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition disabled:opacity-40 ${
        accent ? 'bg-pos-accent-soft text-pos-accent hover:bg-pos-accent/20' : 'bg-white text-neutral-700 ring-1 ring-black/5 hover:bg-neutral-50'
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" /> <span className="hidden whitespace-nowrap xl:inline">{label}</span>
    </button>
  );
}

function PayButton({ icon: Icon, label, onClick, disabled }: { icon: typeof Percent; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      data-help="pos_payMethod"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1 rounded-xl border border-neutral-200 py-2 text-[11px] font-medium text-neutral-600 hover:border-pos-accent hover:bg-pos-accent-soft hover:text-pos-accent disabled:opacity-40 disabled:hover:border-neutral-200 disabled:hover:bg-transparent disabled:hover:text-neutral-600"
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}

function MenuItem({ icon: Icon, label, onClick, danger }: { icon: typeof Percent; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-neutral-50 ${danger ? 'text-red-600' : 'text-neutral-700'}`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}
