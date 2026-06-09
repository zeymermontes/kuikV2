'use client';

import { useMemo, useReducer, useState, useCallback, useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Search, Globe, MapPin, ChevronDown, ChevronLeft, X, CalendarCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type {
  Tenant,
  TenantTheme,
  TenantContact,
  TenantOrdering,
  LoyaltyProgram,
  BranchLite,
  MenuCategory,
  Product,
} from '@/lib/database.types';
import type { CartLine } from '@/lib/whatsapp';
import { resolveMenuSettings, RADIUS_CLASS } from '@/lib/menu-settings';
import { mapHref } from '@/lib/hours';
import { BADGES, badgeLabel } from '@/lib/badges';
import { LoyaltyButton } from './LoyaltyCard';
import { ProductCard } from './ProductCard';
import { ProductSheet } from './ProductSheet';
import { CategoryBanner } from './CategoryBanner';
import { SeparatorRow } from './SeparatorRow';
import { CartBar } from './CartBar';
import { CartSheet } from './CartSheet';
import { OpenStatus } from './OpenStatus';
import { ReservationSheet } from './ReservationSheet';

type CartState = Record<string, CartLine>; // keyed by CartLine.key

type CartAction =
  | { type: 'addLine'; line: CartLine }
  | { type: 'inc'; key: string }
  | { type: 'dec'; key: string }
  | { type: 'note'; key: string; note: string }
  | { type: 'remove'; key: string }
  | { type: 'replace'; state: CartState }
  | { type: 'clear' };

function cartReducer(state: CartState, a: CartAction): CartState {
  switch (a.type) {
    case 'replace':
      return a.state;
    case 'addLine': {
      const ex = state[a.line.key];
      return {
        ...state,
        [a.line.key]: ex
          ? { ...ex, qty: ex.qty + a.line.qty, note: a.line.note ?? ex.note }
          : a.line,
      };
    }
    case 'inc':
      return state[a.key]
        ? { ...state, [a.key]: { ...state[a.key], qty: state[a.key].qty + 1 } }
        : state;
    case 'dec': {
      const line = state[a.key];
      if (!line) return state;
      if (line.qty <= 1) {
        const next = { ...state };
        delete next[a.key];
        return next;
      }
      return { ...state, [a.key]: { ...line, qty: line.qty - 1 } };
    }
    case 'note':
      return state[a.key]
        ? { ...state, [a.key]: { ...state[a.key], note: a.note } }
        : state;
    case 'remove': {
      const next = { ...state };
      delete next[a.key];
      return next;
    }
    case 'clear':
      return {};
    default:
      return state;
  }
}

export function MenuView({
  tenant,
  theme,
  contact,
  ordering,
  loyalty,
  plan,
  branches = [],
  currentBranch = null,
  landingEnabled = false,
  menu,
}: {
  tenant: Tenant;
  theme: TenantTheme;
  contact: TenantContact;
  ordering: TenantOrdering;
  loyalty: LoyaltyProgram;
  plan: 'basic' | 'pro';
  branches?: BranchLite[];
  currentBranch?: string | null;
  landingEnabled?: boolean;
  menu: MenuCategory[];
}) {
  const t = useTranslations('menu');
  const settings = useMemo(() => resolveMenuSettings(theme.settings), [theme.settings]);
  const [cart, dispatch] = useReducer(cartReducer, {});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [presetTable, setPresetTable] = useState<string | null>(null);
  const [showReserve, setShowReserve] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [navStuck, setNavStuck] = useState(false);
  const [barH, setBarH] = useState(52);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const tabRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const navRef = useRef<HTMLElement | null>(null);
  const stickyRef = useRef<HTMLDivElement | null>(null);

  const currency = settings.currency;
  const locale = tenant.locale === 'en' ? 'en-US' : 'es-MX';
  const orderingEnabled = ordering.ordering_enabled && Boolean(contact.whatsapp_phone);
  const radiusClass = RADIUS_CLASS[settings.cornerRadius];

  const lines = useMemo(() => Object.values(cart), [cart]);
  const itemCount = lines.reduce((n, l) => n + l.qty, 0);

  // Quantity per product (summed across variant/extra combinations).
  const qtyByProduct = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lines) m[l.productId] = (m[l.productId] ?? 0) + l.qty;
    return m;
  }, [lines]);

  // Map each product to its section name (for grouping the WhatsApp ticket).
  const catNameByProduct = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of menu) for (const e of c.entries) if (e.kind === 'product') m[e.id] = c.name;
    return m;
  }, [menu]);

  // Persist the cart in the browser, per restaurant, so it survives reloads.
  const cartStoreKey = `kuik:cart:${tenant.id}`;
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        const raw = localStorage.getItem(cartStoreKey);
        if (raw) dispatch({ type: 'replace', state: JSON.parse(raw) });
      } catch {
        // ignore corrupt/unavailable storage
      }
    }, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id]);
  useEffect(() => {
    try {
      localStorage.setItem(cartStoreKey, JSON.stringify(cart));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart]);

  const trackView = useCallback(
    (productId: string) => {
      fetch(`/api/track/${tenant.id}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId }),
        keepalive: true,
      }).catch(() => {});
    },
    [tenant.id],
  );

  // Tapping a product always opens its detail sheet (image, options, qty).
  const openProduct = useCallback(
    (product: Product) => {
      trackView(product.id);
      setActiveProduct(product);
    },
    [trackView],
  );

  // Table QR: /menu?mesa=<n> pre-selects dine-in with that table number.
  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get('mesa');
    if (!m) return;
    const id = setTimeout(() => setPresetTable(m), 0);
    return () => clearTimeout(id);
  }, []);

  // Deep link from the landing's featured row: /menu?product=<id> opens its
  // detail and scrolls the menu to that product.
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get('product');
    if (!pid) return;
    let foundCat: MenuCategory | null = null;
    let foundEntry: Product | null = null;
    for (const c of menu) {
      const entry = c.entries.find((e) => e.kind === 'product' && e.id === pid);
      if (entry) {
        foundCat = c;
        foundEntry = entry as unknown as Product;
        break;
      }
    }
    if (!foundEntry) return;
    // Make sure the product's tab is active (tabs mode renders one section).
    const t1 = setTimeout(() => setActiveCat(foundCat!.id), 0);
    const t2 = setTimeout(() => {
      openProduct(foundEntry!);
      document.getElementById(`prod-${pid}`)?.scrollIntoView({ block: 'center' });
    }, 160);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [menu, openProduct]);

  // Badges actually present in the menu (for the filter bar).
  const presentBadges = useMemo(() => {
    const tags = new Set<string>();
    for (const c of menu) {
      for (const e of c.entries) {
        if (e.kind === 'product') e.tags.forEach((tg) => tags.add(tg));
      }
    }
    return BADGES.filter((b) => tags.has(b.key));
  }, [menu]);

  // Apply search + tag filters + sold-out hiding per category.
  const filteredMenu = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu
      .map((cat) => {
        const entries = cat.entries.filter((e) => {
          if (e.kind === 'separator') return !q && activeTags.length === 0;
          if (settings.soldOutStyle === 'hide' && !e.is_available) return false;
          if (q && !`${e.name} ${e.description ?? ''}`.toLowerCase().includes(q)) return false;
          if (activeTags.length > 0 && !e.tags.some((tg) => activeTags.includes(tg))) return false;
          return true;
        });
        return { ...cat, entries };
      })
      .filter((cat) => cat.entries.length > 0);
  }, [menu, query, activeTags, settings.soldOutStyle]);

  // Scroll-spy: highlight the category whose section sits under the sticky nav.
  const catKey = filteredMenu.map((c) => c.id).join(',');
  useEffect(() => {
    if (settings.navMode === 'tabs') return; // tabs mode shows one section at a time
    const ids = catKey ? catKey.split(',') : [];
    if (ids.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        const top = visible.reduce((a, b) =>
          a.boundingClientRect.top < b.boundingClientRect.top ? a : b,
        );
        setActiveCat((top.target as HTMLElement).dataset.catid ?? null);
      },
      { rootMargin: '-88px 0px -70% 0px', threshold: 0 },
    );
    ids.forEach((id) => {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [catKey, settings.navMode]);

  // Keep the active tab visible within the horizontally-scrolling nav.
  useEffect(() => {
    if (!activeCat) return;
    const tab = tabRefs.current[activeCat];
    const nav = navRef.current;
    if (tab && nav) {
      nav.scrollTo({ left: tab.offsetLeft - nav.clientWidth / 2 + tab.clientWidth / 2, behavior: 'smooth' });
    }
  }, [activeCat]);

  const gridContainer = settings.cardStyle === 'grid';
  const tabsMode = settings.navMode === 'tabs';
  const showNav = (settings.stickyTabs || tabsMode) && filteredMenu.length > 1;

  // The category bar's background = the page background (image or color). When
  // an image is used, the bar is left transparent and a clipped copy of the
  // FIXED page-background layer is painted behind it only while it's stuck to the
  // top — this stays pixel-perfect aligned without `background-attachment: fixed`
  // (which jitters on Android when the URL bar hides and the viewport resizes).
  const navBgImage = settings.darkMode === 'on' ? null : theme.background_image_url;
  const navStyle: React.CSSProperties = navBgImage
    ? { backgroundColor: 'var(--tab-bar-bg)' }
    : { backgroundColor: 'var(--brand-bg)', backgroundImage: 'linear-gradient(var(--tab-bar-bg), var(--tab-bar-bg))' };

  // Track when the bar is stuck to the top so the occluding strip only shows then.
  useEffect(() => {
    const el = stickyRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setNavStuck(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [showNav]);

  // Keep the occluding strip's height in sync with the bar.
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBarH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [showNav]);

  const effectiveActive = activeCat ?? filteredMenu[0]?.id;
  // In tabs mode only the active category renders; in scroll mode, all of them.
  const visibleCats = tabsMode
    ? filteredMenu.filter((c) => c.id === effectiveActive)
    : filteredMenu;

  return (
    <div className="mx-auto min-h-screen w-full max-w-2xl pb-28">
      {/* Back to the landing (only when a landing home exists) */}
      {landingEnabled && (
        <Link
          href="/"
          aria-label={t('back')}
          className="absolute left-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full shadow-md"
          style={{ backgroundColor: 'var(--brand-surface)', color: 'var(--brand-text)' }}
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
      )}

      {/* Cover */}
      {theme.cover_image_url && (
        <div className="relative h-40 w-full overflow-hidden sm:h-52">
          <Image src={theme.cover_image_url} alt={tenant.name} fill className="object-cover" priority />
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col items-center gap-2 px-5 pt-6 pb-3 text-center">
        {theme.logo_url && (
          <Image
            src={theme.logo_url}
            alt={tenant.name}
            width={88}
            height={88}
            className={`h-20 w-20 rounded-full object-cover shadow-sm ${theme.cover_image_url ? '-mt-16 ring-4 ring-[var(--brand-bg)]' : ''}`}
          />
        )}
        {settings.showName && (
          <h1 className="text-2xl font-bold" style={{ color: 'var(--brand-text)' }}>
            {tenant.name}
          </h1>
        )}
        {theme.slogan && <p className="text-sm opacity-70">{theme.slogan}</p>}
        <OpenStatus hours={contact.hours} />
        <ContactLinks contact={contact} showSocial={settings.showSocial} />
        {contact.reservations_enabled && !landingEnabled && (
          <button
            onClick={() => setShowReserve(true)}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
            style={{ backgroundColor: 'var(--brand-button)', color: 'var(--brand-button-text)' }}
          >
            <CalendarCheck className="h-4 w-4" /> {t('reserve')}
          </button>
        )}
        {loyalty.enabled && plan === 'pro' && (
          <div className="mt-2">
            <LoyaltyButton tenantId={tenant.id} program={loyalty} />
          </div>
        )}
        {branches.length > 0 && (
          <BranchPicker branches={branches} current={currentBranch} />
        )}
      </header>

      {/* Search */}
      {settings.showSearch && (
        <div className="px-4 pb-2">
          <div
            className="flex items-center gap-2 rounded-full border px-4 py-2.5"
            style={{ backgroundColor: 'var(--search-bg)', color: 'var(--search-text)', borderColor: 'var(--search-border)' }}
          >
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search')}
              className="w-full bg-transparent text-sm outline-none placeholder:opacity-50"
              style={{ color: 'var(--search-text)' }}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label={t('clearSearch')}
                className="shrink-0 opacity-50 transition hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filter chips */}
      {settings.showFilters && presentBadges.length > 0 && (
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-2">
          {presentBadges.map((b) => {
            const on = activeTags.includes(b.key);
            return (
              <button
                key={b.key}
                onClick={() =>
                  setActiveTags((cur) => (on ? cur.filter((x) => x !== b.key) : [...cur, b.key]))
                }
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${on ? '' : 'opacity-60'}`}
                style={{ backgroundColor: b.color, color: b.text, outline: on ? `2px solid ${b.text}` : undefined }}
              >
                {b.emoji} {badgeLabel(b, tenant.locale)}
              </button>
            );
          })}
        </div>
      )}

      {/* Occluding strip: a clipped copy of the FIXED page background, shown only
          while the bar is stuck — pixel-perfect with the page bg, no jitter. */}
      {showNav && navStuck && navBgImage && (
        <div
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-10"
          style={{
            width: '100vw',
            height: '100lvh',
            backgroundColor: 'var(--brand-bg)',
            backgroundImage: `url(${navBgImage})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            clipPath: `inset(0 0 calc(100lvh - ${barH}px) 0)`,
          }}
        />
      )}

      {/* Category tab nav (chips). Always shown in tabs mode. */}
      {showNav && (
        <>
        <div ref={stickyRef} aria-hidden className="h-px" />
        <nav
          ref={navRef}
          className="no-scrollbar sticky top-0 z-20 flex items-center gap-2 overflow-x-auto px-4 py-3"
          style={navStyle}
        >
          {filteredMenu.map((cat) => {
            const active = effectiveActive === cat.id;
            return (
              <a
                key={cat.id}
                ref={(el) => {
                  tabRefs.current[cat.id] = el;
                }}
                href={`#cat-${cat.id}`}
                onClick={(e) => {
                  setActiveCat(cat.id);
                  if (tabsMode) {
                    e.preventDefault();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition"
                style={{
                  backgroundColor: active ? 'var(--tab-selected-bg)' : 'var(--tab-unselected-bg)',
                  color: active ? 'var(--tab-selected-text)' : 'var(--tab-unselected-text)',
                  fontFamily: 'var(--font-category)',
                }}
              >
                <CatIcon cat={cat} size={18} />
                {cat.name}
              </a>
            );
          })}
        </nav>
        </>
      )}

      {/* Sections */}
      <div className="space-y-8 px-4 pt-6">
        {visibleCats.map((cat) => {
          // Collapsing only applies in scroll mode (tabs mode shows one category).
          const collapsible = settings.collapsibleCategories && !tabsMode;
          const isCollapsed = collapsible && collapsed[cat.id];
          const hasBanner = Boolean(cat.banner_image_url || cat.banner_name);
          const toggle = () =>
            collapsible && setCollapsed((c) => ({ ...c, [cat.id]: !c[cat.id] }));
          return (
            <section
              key={cat.id}
              id={`cat-${cat.id}`}
              data-catid={cat.id}
              ref={(el) => {
                sectionRefs.current[cat.id] = el;
              }}
              className="scroll-mt-20"
            >
              <button
                onClick={toggle}
                disabled={!collapsible}
                className="mb-3 flex w-full items-center justify-between gap-3 text-left disabled:cursor-default"
              >
                <div className="min-w-0 flex-1">
                  {hasBanner ? (
                    <CategoryBanner name={cat.banner_name ?? cat.name} imageUrl={cat.banner_image_url} />
                  ) : (
                    <h2
                      className="flex items-center gap-2"
                      style={{
                        color: 'var(--brand-secondary)',
                        fontFamily: 'var(--font-category)',
                        fontSize: 'var(--fs-category)',
                        fontWeight: 'var(--fw-category)',
                        fontStyle: 'var(--fst-category)',
                      }}
                    >
                      <CatIcon cat={cat} size={24} />
                      {cat.name}
                    </h2>
                  )}
                </div>
                {collapsible && (
                  <ChevronDown
                    className={`h-6 w-6 shrink-0 transition ${isCollapsed ? '-rotate-90' : ''}`}
                    style={{ color: 'var(--brand-primary)' }}
                  />
                )}
              </button>

              {!isCollapsed && (
                <div className={gridContainer ? 'grid grid-cols-2 gap-3' : settings.cardStyle === 'large' ? 'space-y-4' : 'space-y-3'}>
                  {cat.entries.map((entry) =>
                    entry.kind === 'separator' ? (
                      <div key={`s-${entry.id}`} className={gridContainer ? 'col-span-2' : ''}>
                        <SeparatorRow separator={entry} />
                      </div>
                    ) : (
                      <ProductCard
                        key={`p-${entry.id}`}
                        product={entry}
                        showPrice={theme.show_prices && entry.show_price}
                        currency={currency}
                        locale={locale}
                        qty={qtyByProduct[entry.id] ?? 0}
                        orderingEnabled={orderingEnabled}
                        cardStyle={settings.cardStyle}
                        imageShape={settings.imageShape}
                        density={settings.density}
                        radiusClass={radiusClass}
                        border={settings.cardBorder}
                        shadow={settings.cardShadow}
                        showBadges={settings.showBadges}
                        onOpen={() => openProduct(entry)}
                        id={`prod-${entry.id}`}
                      />
                    ),
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {orderingEnabled && itemCount > 0 && (
        <CartBar count={itemCount} onOpen={() => setSheetOpen(true)} label={t('yourOrder')} />
      )}

      {showReserve && (
        <ReservationSheet tenantId={tenant.id} required={contact.reservation_required} onClose={() => setShowReserve(false)} />
      )}

      {activeProduct && (
        <ProductSheet
          product={activeProduct}
          showPrice={theme.show_prices && activeProduct.show_price}
          currency={currency}
          locale={locale}
          onClose={() => setActiveProduct(null)}
          onConfirm={(line) =>
            dispatch({
              type: 'addLine',
              line: { ...line, categoryName: catNameByProduct[line.productId] },
            })
          }
        />
      )}

      {sheetOpen && (
        <CartSheet
          tenant={tenant}
          contact={contact}
          ordering={ordering}
          showPrices={theme.show_prices}
          currency={currency}
          locale={locale}
          lines={lines}
          presetTable={presetTable}
          onClose={() => setSheetOpen(false)}
          onInc={(key) => dispatch({ type: 'inc', key })}
          onDec={(key) => dispatch({ type: 'dec', key })}
          onNote={(key, note) => dispatch({ type: 'note', key, note })}
          onRemove={(key) => dispatch({ type: 'remove', key })}
        />
      )}
    </div>
  );
}

function BranchPicker({ branches, current }: { branches: BranchLite[]; current: string | null }) {
  const t = useTranslations('menu');
  return (
    <label
      className="mt-2 flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
      style={{ backgroundColor: 'var(--brand-surface)' }}
    >
      <MapPin className="h-4 w-4" style={{ color: 'var(--brand-primary)' }} />
      <select
        value={current ?? ''}
        onChange={(e) => {
          window.location.href = e.target.value ? `/b/${e.target.value}` : '/menu';
        }}
        className="bg-transparent outline-none"
      >
        <option value="">{t('chooseBranch')}</option>
        {branches.map((b) => (
          <option key={b.id} value={b.slug}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function CatIcon({ cat, size }: { cat: MenuCategory; size: number }) {
  if (cat.icon_image_url) {
    return (
      <Image
        src={cat.icon_image_url}
        alt=""
        width={size}
        height={size}
        className="rounded object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  if (cat.icon) {
    return (
      <span style={{ fontSize: size * 0.9, lineHeight: 1 }} aria-hidden>
        {cat.icon}
      </span>
    );
  }
  return null;
}

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0 0 22 12z" />
    </svg>
  );
}

// "Get directions" + social links as labeled pills in one row.
function ContactLinks({ contact, showSocial }: { contact: TenantContact; showSocial: boolean }) {
  const t = useTranslations('menu');
  const map = mapHref(contact.maps_url, contact.address);
  const items: { href: string; label: string; icon: React.ReactNode }[] = [];
  if (map) items.push({ href: map, label: t('directions'), icon: <MapPin className="h-4 w-4" /> });
  if (showSocial) {
    if (contact.instagram)
      items.push({
        href: `https://instagram.com/${contact.instagram.replace(/^@/, '')}`,
        label: 'Instagram',
        icon: <InstagramIcon className="h-4 w-4" />,
      });
    if (contact.facebook) items.push({ href: contact.facebook, label: 'Facebook', icon: <FacebookIcon className="h-4 w-4" /> });
    if (contact.website) items.push({ href: contact.website, label: t('website'), icon: <Globe className="h-4 w-4" /> });
  }
  if (items.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
      {items.map(({ href, label, icon }, i) => (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
          style={{ backgroundColor: 'var(--brand-surface)', color: 'var(--brand-primary)' }}
        >
          {icon} {label}
        </a>
      ))}
    </div>
  );
}
