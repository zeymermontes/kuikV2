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
import {
  resolveMenuSettings,
  resolveItemLayout,
  RADIUS_CLASS,
  CONTENT_WIDTH_CLASS,
  ALIGN_CLASS,
  JUSTIFY_CLASS,
  textTransform,
  showCategoryTitle,
  pickImage,
} from '@/lib/menu-settings';
import { mapHref } from '@/lib/hours';
import { digitsOnly, slugify } from '@/lib/utils';
import { BADGES, badgeLabel } from '@/lib/badges';
import { hasDetail } from '@/lib/menu-options';
import { LoyaltyButton } from './LoyaltyCard';
import { ProductCard } from './ProductCard';
import { ProductSheet } from './ProductSheet';
import { CategoryBanner } from './CategoryBanner';
import { SeparatorRow } from './SeparatorRow';
import { CartBar } from './CartBar';
import { CartSheet } from './CartSheet';
import { OpenStatus } from './OpenStatus';
import { ReservationSheet } from './ReservationSheet';
import { WhatsAppBubble } from './WhatsAppBubble';

// The bar header's side actions. On a narrow phone the wordmark needs the
// room, so they collapse to round icon buttons and the label returns at `sm`.
const BAR_ACTION =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border ' +
  'h-9 w-9 sm:h-auto sm:w-auto sm:px-4 sm:py-1.5 text-sm font-medium';
const BAR_ACTION_LABEL = 'hidden sm:inline';

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
  currentBranchId = null,
  openReservation = false,
  landingEnabled = false,
  channel = 'online',
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
  /** The branch's id. `currentBranch` is its slug, which a booking can't use. */
  currentBranchId?: string | null;
  /** Open the reservation sheet on arrival (from `?reservar=1`). */
  openReservation?: boolean;
  landingEnabled?: boolean;
  /** 'qr' = reached from a QR inside the restaurant; 'online' = a shared link. */
  channel?: 'online' | 'qr';
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
  // Decided on the server from `?reservar=1`, so the first render matches and
  // hydration stays quiet.
  const [showReserve, setShowReserve] = useState(
    openReservation && contact.reservations_enabled,
  );
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
  // Which channel this visit came through. The in-place route (/qr) says so
  // up front; a legacy table QR (/menu?mesa=N) is detected after mount.
  const [qrChannel, setQrChannel] = useState(channel === 'qr');
  useEffect(() => {
    if (channel === 'qr') return;
    if (!new URLSearchParams(window.location.search).has('mesa')) return;
    const id = setTimeout(() => setQrChannel(true), 0);
    return () => clearTimeout(id);
  }, [channel]);

  // A restaurant can run the cart on one channel and a look-only menu on the
  // other — e.g. QR guests order with the waiter, online guests via WhatsApp.
  const channelOrdering = qrChannel
    ? ordering.ordering_qr_enabled !== false
    : ordering.ordering_online_enabled !== false;
  const orderingEnabled =
    ordering.ordering_enabled && channelOrdering && Boolean(contact.whatsapp_phone);
  const radiusClass = RADIUS_CLASS[settings.cornerRadius];
  const layout = useMemo(() => resolveItemLayout(settings), [settings]);

  // Readable anchors: #desayunos rather than #cat-<uuid>. A subcategory is
  // prefixed with its parent so two "Extras" under different sections stay
  // distinct; anything still colliding gets a numeric suffix.
  const anchorById = useMemo(() => {
    const used = new Set<string>();
    const map: Record<string, string> = {};
    const take = (base: string, id: string) => {
      let slug = base || 'seccion';
      for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`;
      used.add(slug);
      map[id] = slug;
    };
    for (const cat of menu) {
      const parent = slugify(cat.name);
      take(parent, cat.id);
      for (const sub of cat.subcategories) {
        const child = slugify(sub.name);
        take(parent && child ? `${parent}-${child}` : child || parent, sub.id);
      }
    }
    return map;
  }, [menu]);
  const anchor = (id: string) => anchorById[id] ?? id;

  // Reverse lookup for deep links: an anchor resolves to the top-level section
  // that has to be showing, plus the element to scroll to (which may be one of
  // its subcategories).
  const targetByAnchor = useMemo(() => {
    const map: Record<string, { catId: string; elementId: string }> = {};
    for (const cat of menu) {
      map[anchorById[cat.id] ?? cat.id] = { catId: cat.id, elementId: anchorById[cat.id] ?? cat.id };
      map[`cat-${cat.id}`] = { catId: cat.id, elementId: `cat-${cat.id}` };
      for (const sub of cat.subcategories) {
        map[anchorById[sub.id] ?? sub.id] = { catId: cat.id, elementId: anchorById[sub.id] ?? sub.id };
        map[`cat-${sub.id}`] = { catId: cat.id, elementId: `cat-${sub.id}` };
      }
    }
    return map;
  }, [menu, anchorById]);

  // /menu#camarones opens on that section. Without this the hash was ignored on
  // load, so a shared link always landed on the first category.
  useEffect(() => {
    const apply = () => {
      const slug = decodeURIComponent(window.location.hash.slice(1));
      const hit = slug ? targetByAnchor[slug] : undefined;
      if (!hit) return;
      setActiveCat(hit.catId);
      // In tabs mode the section mounts only after the tab switches.
      setTimeout(() => {
        document.getElementById(hit.elementId)?.scrollIntoView({ block: 'start' });
      }, 80);
    };
    const id = setTimeout(apply, 0);
    window.addEventListener('hashchange', apply);
    return () => {
      clearTimeout(id);
      window.removeEventListener('hashchange', apply);
    };
  }, [targetByAnchor]);

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
    const keep = (e: MenuCategory['entries'][number]) => {
      if (e.kind === 'separator') return !q && activeTags.length === 0;
      if (settings.soldOutStyle === 'hide' && !e.is_available) return false;
      if (q && !`${e.name} ${e.description ?? ''}`.toLowerCase().includes(q)) return false;
      if (activeTags.length > 0 && !e.tags.some((tg) => activeTags.includes(tg))) return false;
      return true;
    };
    return menu
      .map((cat) => ({
        ...cat,
        entries: cat.entries.filter(keep),
        // A subcategory drops out once nothing in it survives the filter.
        subcategories: cat.subcategories
          .map((sub) => ({ ...sub, entries: sub.entries.filter(keep) }))
          .filter((sub) => sub.entries.length > 0),
      }))
      // A section stays if it has entries of its own or any surviving subcategory.
      .filter((cat) => cat.entries.length > 0 || cat.subcategories.length > 0);
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
      { rootMargin: `-${barH + 36}px 0px -70% 0px`, threshold: 0 },
    );
    ids.forEach((id) => {
      const el = sectionRefs.current[id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [catKey, settings.navMode, barH]);

  // Keep the active tab visible within the horizontally-scrolling nav.
  useEffect(() => {
    if (!activeCat) return;
    const tab = tabRefs.current[activeCat];
    const nav = navRef.current;
    if (tab && nav) {
      nav.scrollTo({ left: tab.offsetLeft - nav.clientWidth / 2 + tab.clientWidth / 2, behavior: 'smooth' });
    }
  }, [activeCat]);

  const gridContainer = layout.columns === 2;
  const tabsMode = settings.navMode === 'tabs';
  const showNav = (settings.stickyTabs || tabsMode) && filteredMenu.length > 1;
  const barHeader = settings.headerStyle === 'bar';
  const hasHeaderExtras =
    Boolean(settings.showSlogan && theme.slogan) ||
    Boolean(settings.showHours && contact.hours) ||
    Boolean(settings.showDirections && mapHref(contact.maps_url, contact.address)) ||
    (settings.showSocial &&
      Boolean(contact.instagram || contact.facebook || contact.website)) ||
    (loyalty.enabled && plan === 'pro') ||
    branches.length > 0;
  // Which brand files this page uses. 'auto' follows the menu's dark mode; a
  // slot can pin the other one (a navy bar wants the light-on-dark wordmark).
  const pageIsDark = settings.darkMode === 'on';
  const logo = pickImage(theme.logo_url, theme.logo_dark_url, settings.logoVariant, pageIsDark);
  const wideLogo =
    pickImage(theme.logo_wide_url, theme.logo_wide_dark_url, settings.logoWideVariant, pageIsDark) ??
    logo;
  const wordmark = Boolean(theme.logo_wide_url || theme.logo_wide_dark_url);
  const cover = pickImage(
    theme.cover_image_url,
    theme.cover_image_dark_url,
    settings.coverVariant,
    pageIsDark,
  );
  // The bar and the category strip either span the viewport or line up with the
  // content column; either way their contents stay centred on the same width.
  const headerWidthClass = settings.fullWidthHeader
    ? 'max-w-5xl'
    : CONTENT_WIDTH_CLASS[settings.contentWidth];
  const navIcon = settings.navIconPosition;
  const stackedNav = navIcon === 'top' || navIcon === 'bottom';
  const plainNav = settings.navTabShape === 'plain';

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

  // One run of products/separators, shared by a section and its subcategories.
  const EntryList = ({ entries }: { entries: MenuCategory['entries'] }) =>
    entries.length === 0 ? null : (
      <div
        className={gridContainer ? 'grid grid-cols-2' : 'flex flex-col'}
        style={{ gap: layout.gap }}
      >
        {entries.map((entry) =>
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
              openable={orderingEnabled || hasDetail(entry)}
              layout={layout}
              settings={settings}
              radiusClass={radiusClass}
              onOpen={() => openProduct(entry)}
              id={`prod-${entry.id}`}
            />
          ),
        )}
      </div>
    );

  return (
    <div className="min-h-screen w-full pb-28">
      {/* Top bar: back · logo · reserve, spanning the viewport. */}
      {barHeader && (
        <div style={{ backgroundColor: 'var(--tab-bar-bg)' }}>
          <div className={`mx-auto flex w-full items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4 ${headerWidthClass}`}>
            <div className="flex flex-1 justify-start">
              {landingEnabled && (
                <Link
                  href="/"
                  aria-label={t('back')}
                  className={BAR_ACTION}
                  style={{ borderColor: 'var(--tab-selected-text)', color: 'var(--tab-selected-text)' }}
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" />
                  <span className={BAR_ACTION_LABEL}>{t('back')}</span>
                </Link>
              )}
            </div>
            <div className="flex min-w-0 shrink items-center justify-center">
              {wideLogo ? (
                <Image
                  src={wideLogo}
                  alt={tenant.name}
                  width={320}
                  height={80}
                  className={`object-contain ${wordmark ? '' : 'rounded-full'}`}
                  style={{
                    maxHeight: settings.logoWideHeight,
                    maxWidth: '100%',
                    width: 'auto',
                    height: 'auto',
                  }}
                  priority
                />
              ) : (
                <span
                  className="text-lg font-bold sm:text-xl"
                  style={{ color: 'var(--tab-selected-text)' }}
                >
                  {tenant.name}
                </span>
              )}
            </div>
            <div className="flex flex-1 justify-end">
              {/* Reservations when they're on; otherwise a direct WhatsApp line,
                  which is what most restaurants put in that corner. */}
              {contact.reservations_enabled ? (
                <button
                  onClick={() => setShowReserve(true)}
                  aria-label={t('reserve')}
                  className={BAR_ACTION}
                  style={{ borderColor: 'var(--tab-selected-text)', color: 'var(--tab-selected-text)' }}
                >
                  <CalendarCheck className="h-4 w-4 shrink-0" />
                  <span className={BAR_ACTION_LABEL}>{t('reserve')}</span>
                </button>
              ) : (
                contact.whatsapp_phone && (
                  <a
                    href={`https://wa.me/${digitsOnly(contact.whatsapp_phone)}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="WhatsApp"
                    className={BAR_ACTION}
                    style={{ borderColor: 'var(--tab-selected-text)', color: 'var(--tab-selected-text)' }}
                  >
                    <WhatsAppIcon className="h-4 w-4 shrink-0" />
                    <span className={BAR_ACTION_LABEL}>WhatsApp</span>
                  </a>
                )
              )}
            </div>
          </div>
        </div>
      )}

      <div className={`mx-auto w-full ${CONTENT_WIDTH_CLASS[settings.contentWidth]}`}>
      {/* Back to the landing (only when a landing home exists) */}
      {landingEnabled && !barHeader && (
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
      {cover && (
        <div className="relative h-40 w-full overflow-hidden sm:h-52">
          <Image src={cover} alt={tenant.name} fill className="object-cover" priority />
        </div>
      )}

      {/* Header */}
      {!barHeader && (
      <header className="flex flex-col items-center gap-2 px-5 pt-6 pb-3 text-center">
        {logo && (
          <Image
            src={logo}
            alt={tenant.name}
            width={88}
            height={88}
            className={`h-20 w-20 rounded-full object-cover shadow-sm ${cover ? '-mt-16 ring-4 ring-[var(--brand-bg)]' : ''}`}
          />
        )}
        {settings.showName && (
          <h1 className="text-2xl font-bold" style={{ color: 'var(--brand-text)' }}>
            {tenant.name}
          </h1>
        )}
        {settings.showSlogan && theme.slogan && <p className="text-sm opacity-70">{theme.slogan}</p>}
        {settings.showHours && <OpenStatus hours={contact.hours} timezone={tenant.timezone} />}
        <ContactLinks
          contact={contact}
          showSocial={settings.showSocial}
          showDirections={settings.showDirections}
        />
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
            <LoyaltyButton tenantId={tenant.id} program={loyalty} logoUrl={logo} />
          </div>
        )}
        {branches.length > 0 && (
          <BranchPicker branches={branches} current={currentBranch} />
        )}
      </header>
      )}

      {/* In bar mode the identity lives in the bar; keep the useful extras.
          Rendered only when there is something to show, so a menu with none of
          them doesn't get an empty band under the bar. */}
      {barHeader && hasHeaderExtras && (
        <div className="flex flex-col items-center gap-2 px-5 pt-4 text-center">
          {settings.showSlogan && theme.slogan && <p className="text-sm opacity-70">{theme.slogan}</p>}
          {settings.showHours && <OpenStatus hours={contact.hours} timezone={tenant.timezone} />}
          <ContactLinks
            contact={contact}
            showSocial={settings.showSocial}
            showDirections={settings.showDirections}
          />
          {loyalty.enabled && plan === 'pro' && (
            <LoyaltyButton tenantId={tenant.id} program={loyalty} logoUrl={logo} />
          )}
          {branches.length > 0 && <BranchPicker branches={branches} current={currentBranch} />}
        </div>
      )}

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

      </div>

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
        {/* Scroll sentinel for "is the bar stuck?". Zero-height on purpose:
            a 1px box here shows as a hairline of page background between the
            header bar and the category strip when both are coloured. */}
        <div ref={stickyRef} aria-hidden className="h-0" />
        <nav ref={navRef} className="sticky top-0 z-20" style={navStyle}>
          {/* The sticky element is deliberately NOT the scroll container:
              Chrome on Android tears a sticky box that also scrolls while the
              URL bar collapses. The clipping still happens on the constrained
              child, so chips stay inside the column. */}
          <div
            className={`no-scrollbar overflow-x-auto ${
              settings.fullWidthHeader ? '' : `mx-auto w-full ${headerWidthClass}`
            }`}
          >
          <div
            className={`flex items-center gap-2 px-4 py-3 ${
              settings.fullWidthHeader ? 'mx-auto w-max min-w-full justify-center' : ''
            }`}
          >
          {filteredMenu.map((cat) => {
            const active = effectiveActive === cat.id;
            return (
              <a
                key={cat.id}
                ref={(el) => {
                  tabRefs.current[cat.id] = el;
                }}
                href={`#${anchor(cat.id)}`}
                onClick={(e) => {
                  setActiveCat(cat.id);
                  if (tabsMode) {
                    // The section is swapped in place rather than scrolled to,
                    // so write the hash ourselves — otherwise the address bar
                    // never reflects the section you're looking at.
                    e.preventDefault();
                    window.history.replaceState(null, '', `#${anchor(cat.id)}`);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className={`flex shrink-0 items-center transition ${
                  stackedNav ? 'w-20 flex-col gap-1 text-center text-xs leading-tight' : 'gap-1.5 text-sm'
                } ${
                  plainNav ? 'px-1 py-0.5' : 'rounded-full px-3 py-1.5'
                } ${active ? 'font-bold' : 'font-medium'}`}
                style={{
                  backgroundColor: plainNav
                    ? 'transparent'
                    : active
                      ? 'var(--tab-selected-bg)'
                      : 'var(--tab-unselected-bg)',
                  color: active ? 'var(--tab-selected-text)' : 'var(--tab-unselected-text)',
                  opacity: plainNav && !active ? 0.7 : 1,
                  fontFamily: 'var(--font-category)',
                }}
              >
                {navIcon !== 'none' && navIcon !== 'bottom' && (
                  <NavIcon cat={cat} settings={settings} active={active} />
                )}
                <span className={stackedNav ? 'block' : undefined}>{cat.name}</span>
                {navIcon === 'bottom' && <NavIcon cat={cat} settings={settings} active={active} />}
              </a>
            );
          })}
          </div>
          </div>
        </nav>
        </>
      )}

      {/* Sections */}
      <div className={`mx-auto w-full space-y-8 px-4 pt-6 ${CONTENT_WIDTH_CLASS[settings.contentWidth]}`}>
        {visibleCats.map((cat) => {
          // Collapsing only applies in scroll mode (tabs mode shows one category).
          const collapsible = settings.collapsibleCategories && !tabsMode;
          const isCollapsed = collapsible && collapsed[cat.id];
          const hasBanner = Boolean(cat.banner_image_url || cat.banner_name);
          const rule = settings.categoryRule;
          const subRule = settings.subcategoryRule;
          const showTitle = showCategoryTitle(settings.categoryTitle, cat.subcategories.length);
          const toggle = () =>
            collapsible && setCollapsed((c) => ({ ...c, [cat.id]: !c[cat.id] }));
          return (
            <section
              key={cat.id}
              id={anchor(cat.id)}
              data-catid={cat.id}
              ref={(el) => {
                sectionRefs.current[cat.id] = el;
              }}
              style={{ scrollMarginTop: showNav ? barH + 12 : 24 }}
            >
              {/* Anchors handed out before sections had readable ids. */}
              <span
                id={`cat-${cat.id}`}
                aria-hidden
                className="block"
                style={{ scrollMarginTop: showNav ? barH + 12 : 24 }}
              />
              <button
                onClick={toggle}
                disabled={!collapsible}
                className={`mb-3 flex w-full items-center gap-3 disabled:cursor-default ${ALIGN_CLASS[settings.categoryAlign]} ${collapsible ? 'justify-between' : JUSTIFY_CLASS[settings.categoryAlign]}`}
              >
                <div className={collapsible ? 'min-w-0 flex-1' : 'min-w-0'}>
                  {hasBanner ? (
                    <CategoryBanner name={cat.banner_name ?? cat.name} imageUrl={cat.banner_image_url} />
                  ) : !showTitle ? null : (
                    <>
                      {rule === 'both' && <CategoryRule />}
                      <h2
                        className={`flex items-center gap-2 ${JUSTIFY_CLASS[settings.categoryAlign]}`}
                        style={{
                          color: 'var(--brand-secondary)',
                          fontFamily: 'var(--font-category)',
                          fontSize: 'var(--fs-category)',
                          fontWeight: 'var(--fw-category)',
                          fontStyle: 'var(--fst-category)',
                          textTransform: textTransform(settings.categoryCase),
                        }}
                      >
                        {settings.categoryIcons && <CatIcon cat={cat} size={24} />}
                        {cat.name}
                      </h2>
                      {rule !== 'none' && <CategoryRule />}
                    </>
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
                <>
                  <EntryList entries={cat.entries} />
                  {/* Subcategories: a smaller heading, then their own items. */}
                  {cat.subcategories.map((sub) => (
                    <section key={sub.id} id={anchor(sub.id)} className="mt-6">
                      <div className={`mb-2 ${ALIGN_CLASS[settings.categoryAlign]}`}>
                        {subRule === 'both' && <CategoryRule />}
                        <h3
                          className={`flex items-center gap-2 ${JUSTIFY_CLASS[settings.categoryAlign]}`}
                          style={{
                            color: 'var(--brand-secondary)',
                            fontFamily: 'var(--font-category)',
                            fontSize: 'var(--fs-subcategory)',
                            fontWeight: 'var(--fw-category)',
                            fontStyle: 'var(--fst-category)',
                            textTransform: textTransform(settings.categoryCase),
                          }}
                        >
                          {settings.categoryIcons && <CatIcon cat={sub} size={20} />}
                          {sub.name}
                        </h3>
                        {subRule !== 'none' && <CategoryRule />}
                      </div>
                      <EntryList entries={sub.entries} />
                    </section>
                  ))}
                </>
              )}
            </section>
          );
        })}
      </div>

      {orderingEnabled && itemCount > 0 && (
        <CartBar count={itemCount} onOpen={() => setSheetOpen(true)} label={t('yourOrder')} />
      )}

      {settings.whatsappBubble && contact.whatsapp_phone && (
        <WhatsAppBubble
          phone={contact.whatsapp_phone}
          label={t('whatsappBubble')}
          raised={orderingEnabled && itemCount > 0}
        />
      )}

      {showReserve && (
        <ReservationSheet
          tenantId={tenant.id}
          branchId={currentBranchId}
          required={contact.reservation_required}
          onClose={() => setShowReserve(false)}
        />
      )}

      {activeProduct && (
        <ProductSheet
          product={activeProduct}
          showPrice={theme.show_prices && activeProduct.show_price}
          currency={currency}
          locale={locale}
          readOnly={!orderingEnabled}
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

/** A category's icon in the nav, optionally inside a filled circle. */
function NavIcon({
  cat,
  settings,
  active,
}: {
  cat: MenuCategory;
  settings: ReturnType<typeof resolveMenuSettings>;
  active: boolean;
}) {
  const size = settings.navIconSize;
  if (settings.navIconShape !== 'circle') return <CatIcon cat={cat} size={size} />;
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: size * 1.5,
        height: size * 1.5,
        backgroundColor: active ? 'var(--tab-selected-bg)' : 'var(--tab-unselected-bg)',
      }}
    >
      <CatIcon cat={cat} size={size} />
    </span>
  );
}

/** Thin horizontal rule framing a category title (printed-menu look). */
function CategoryRule() {
  return (
    <span
      aria-hidden
      className="my-1.5 block h-px w-full"
      style={{ backgroundColor: 'var(--brand-separator)' }}
    />
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

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.75-.72 2-1.4.25-.7.25-1.28.17-1.4-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.6 2 2.17 6.43 2.16 11.88c0 1.74.46 3.44 1.32 4.94L2 22l5.32-1.4a9.9 9.9 0 0 0 4.72 1.2h.01c5.44 0 9.87-4.43 9.88-9.88A9.82 9.82 0 0 0 19.03 5a9.8 9.8 0 0 0-6.99-3zm0 18.1h-.01a8.2 8.2 0 0 1-4.18-1.15l-.3-.18-3.1.82.83-3.04-.2-.31a8.18 8.18 0 0 1-1.26-4.36c0-4.53 3.69-8.21 8.22-8.21a8.16 8.16 0 0 1 8.2 8.22c0 4.53-3.68 8.21-8.2 8.21z" />
    </svg>
  );
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
function ContactLinks({
  contact,
  showSocial,
  showDirections,
}: {
  contact: TenantContact;
  showSocial: boolean;
  showDirections: boolean;
}) {
  const t = useTranslations('menu');
  const map = showDirections ? mapHref(contact.maps_url, contact.address) : null;
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
