'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Palette,
  Home,
  ShoppingBag,
  Gift,
  Phone,
  Globe,
  CreditCard,
  Shield,
  Users,
  BarChart3,
  Store,
  ClipboardList,
  CalendarCheck,
  MessageCircle,
  Calculator,
  Monitor,
  ExternalLink,
  LogOut,
  Menu as MenuIcon,
  X,
} from 'lucide-react';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { canUse, type PlanTier, type Feature } from '@/lib/plan';
import type { MemberRole } from '@/lib/database.types';
import { signOut } from '@/app/(auth)/actions';
import { setActiveTenant } from '@/app/(dashboard)/tenant-actions';
import { LocaleSwitch } from './LocaleSwitch';
import { InstallPrompt } from './InstallPrompt';
import { PendingReservationsBadge } from './PendingReservationsBadge';
import { HandoffBadge } from './HandoffBadge';

// `roles` lists which member roles see each item.
// `dev: true` items are in development — only shown to dev accounts (see lib/features.ts).
// `feature` ties an item to a Pro-only feature; hidden for Basic plans when plan
// enforcement is on (support mode) — see lib/plan.ts.
//
// These `roles` lists and the requireRole() guards in lib/auth.ts must agree.
// The nav only hides a link; the guard is what actually stops someone typing
// the URL. Change one, change the other.
// Grouped by how often a restaurant opens each screen: the daily desk first,
// what shapes the menu next, growth tools, and one-time setup last. A group
// with nothing visible for this role or plan simply is not drawn.
const NAV_GROUPS = ['ops', 'brand', 'growth', 'settings'] as const;
const NAV = [
  // Operación
  { group: 'ops', href: '/dashboard', icon: LayoutDashboard, key: 'dashboard', roles: ['owner', 'manager'] },
  { group: 'ops', href: '/reservations', icon: CalendarCheck, key: 'reservations', roles: ['owner', 'manager', 'cashier', 'waiter', 'host'] },
  { group: 'ops', href: '/orders', icon: ClipboardList, key: 'orders', roles: ['owner', 'manager', 'cashier', 'waiter'], dev: true },
  { group: 'ops', href: '/whatsapp', icon: MessageCircle, key: 'whatsapp', roles: ['owner', 'manager'] },
  { group: 'ops', href: '/pos', icon: Calculator, key: 'pos', roles: ['owner', 'manager', 'cashier', 'waiter'], dev: true, feature: 'pos' },
  { group: 'ops', href: '/kds', icon: Monitor, key: 'kds', roles: ['owner', 'manager', 'cashier', 'waiter'], dev: true },
  // Menú y marca
  { group: 'brand', href: '/menu', icon: UtensilsCrossed, key: 'menu', roles: ['owner', 'manager', 'cashier', 'waiter', 'host'] },
  { group: 'brand', href: '/design', icon: Palette, key: 'design', roles: ['owner'] },
  { group: 'brand', href: '/landing', icon: Home, key: 'landing', roles: ['owner'] },
  { group: 'brand', href: '/branches', icon: Store, key: 'branches', roles: ['owner', 'manager'], feature: 'branches' },
  // Crecimiento
  { group: 'growth', href: '/loyalty', icon: Gift, key: 'loyalty', roles: ['owner', 'manager', 'waiter'], feature: 'loyalty' },
  { group: 'growth', href: '/reports', icon: BarChart3, key: 'reports', roles: ['owner', 'manager'], feature: 'pro_reports' },
  // Configuración
  { group: 'settings', href: '/ordering', icon: ShoppingBag, key: 'ordering', roles: ['owner'] },
  { group: 'settings', href: '/contact', icon: Phone, key: 'contact', roles: ['owner'] },
  { group: 'settings', href: '/staff', icon: Users, key: 'staff', roles: ['owner'] },
  { group: 'settings', href: '/domain', icon: Globe, key: 'domain', roles: ['owner'], feature: 'custom_domain' },
  { group: 'settings', href: '/billing', icon: CreditCard, key: 'billing', roles: ['owner'] },

] as const;

export function Sidebar({
  isSuperAdmin,
  showDevFeatures,
  role,
  menuUrl,
  locale,
  tenants,
  activeTenantId,
  plan,
  enforcePlan,
  pendingReservations,
  pendingHandoffs,
}: {
  isSuperAdmin: boolean;
  showDevFeatures: boolean;
  role: MemberRole;
  menuUrl: string;
  locale: string;
  tenants: { id: string; name: string }[];
  activeTenantId: string;
  plan: PlanTier;
  // When true (support mode), hide Pro-only items the tenant's plan can't use.
  enforcePlan: boolean;
  /** Reservation requests still waiting on a yes or no, across all future days. */
  pendingReservations: number;
  /** WhatsApp conversations parked waiting for a human. */
  pendingHandoffs: number;
}) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tDash = useTranslations('dashboard');
  const tAuth = useTranslations('auth');
  const [open, setOpen] = useState(false);

  const switcher = (
    <RestaurantSwitcher tenants={tenants} activeId={activeTenantId} newLabel={t('newRestaurant')} />
  );

  const visible = NAV.filter(
    (item) =>
      (item.roles as readonly string[]).includes(role) &&
      (!('dev' in item && item.dev) || showDevFeatures) &&
      (!('feature' in item && item.feature) || !enforcePlan || canUse(plan, item.feature as Feature)),
  );

  const nav = (
    <nav className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1">
      {NAV_GROUPS.map((group) => {
        const items = visible.filter((item) => item.group === group);
        if (items.length === 0) return null;
        return (
          <div key={group} className="flex flex-col gap-1 [&+&]:mt-3">
            <p className="px-3 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
              {t(`group_${group}`)}
            </p>
            {items.map(({ href, icon: Icon, key }) => (
              <NavLink
                key={href}
                href={href}
                // /whatsapp has subroutes (flows, inbox); the item stays lit there.
                active={pathname === href || (href === '/whatsapp' && pathname.startsWith('/whatsapp/'))}
                icon={Icon}
                onClick={() => setOpen(false)}
              >
                {t(key)}
                {key === 'reservations' && (
                  <PendingReservationsBadge tenantId={activeTenantId} initial={pendingReservations} />
                )}
                {key === 'whatsapp' && (
                  <HandoffBadge tenantId={activeTenantId} initial={pendingHandoffs} />
                )}
              </NavLink>
            ))}
          </div>
        );
      })}
      {isSuperAdmin && (
        <NavLink href="/admin" active={pathname.startsWith('/admin')} icon={Shield} onClick={() => setOpen(false)}>
          {t('superAdmin')}
        </NavLink>
      )}
    </nav>
  );

  const footer = (
    <div className="mt-4 flex flex-col gap-2 border-t border-neutral-100 pt-4">
      <a
        href={menuUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
      >
        <ExternalLink className="h-4 w-4" /> {tDash('viewMenu')}
      </a>
      <InstallPrompt />
      <LocaleSwitch current={locale} />
      <form action={signOut}>
        <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100">
          <LogOut className="h-4 w-4" /> {tAuth('signOut')}
        </button>
      </form>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-neutral-200 bg-white p-4 md:flex">
        <div className="mb-4 px-2 text-xl font-bold tracking-tight">Kuik</div>
        {switcher}
        {nav}
        {footer}
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-4 md:hidden">
        <button onClick={() => setOpen(true)} aria-label="menu" className="-ml-1 p-1.5 text-neutral-700">
          <MenuIcon className="h-6 w-6" />
        </button>
        <span className="text-lg font-bold tracking-tight">Kuik</span>
      </header>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[80%] flex-col bg-white p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-2">
              <span className="text-xl font-bold tracking-tight">Kuik</span>
              <button onClick={() => setOpen(false)} aria-label="close" className="p-1 text-neutral-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            {switcher}
            {nav}
            {footer}
          </div>
        </div>
      )}
    </>
  );
}

function RestaurantSwitcher({
  tenants,
  activeId,
  newLabel,
}: {
  tenants: { id: string; name: string }[];
  activeId: string;
  newLabel: string;
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const [, startTransition] = useTransition();
  const active = tenants.find((x) => x.id === activeId);

  return (
    <div className="relative mb-3">
      <button
        onClick={() => setOpenMenu((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
      >
        <span className="truncate">{active?.name ?? '—'}</span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-neutral-400" />
      </button>
      {openMenu && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg">
          {tenants.map((tn) => (
            <button
              key={tn.id}
              onClick={() => startTransition(() => setActiveTenant(tn.id))}
              className={cn(
                'block w-full truncate px-3 py-2 text-left text-sm hover:bg-neutral-100',
                tn.id === activeId && 'font-semibold',
              )}
            >
              {tn.name}
            </button>
          ))}
          <Link
            href="/onboarding"
            className="flex items-center gap-1.5 border-t border-neutral-100 px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            <Plus className="h-4 w-4" /> {newLabel}
          </Link>
        </div>
      )}
    </div>
  );
}

function NavLink({
  href,
  active,
  icon: Icon,
  onClick,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
        active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </Link>
  );
}
