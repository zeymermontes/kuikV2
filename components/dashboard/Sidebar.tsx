'use client';

import { useState } from 'react';
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
  ExternalLink,
  LogOut,
  Menu as MenuIcon,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MemberRole } from '@/lib/database.types';
import { signOut } from '@/app/(auth)/actions';
import { LocaleSwitch } from './LocaleSwitch';

// `roles` lists which member roles see each item.
const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, key: 'dashboard', roles: ['owner', 'manager'] },
  { href: '/menu', icon: UtensilsCrossed, key: 'menu', roles: ['owner', 'manager', 'waiter'] },
  { href: '/loyalty', icon: Gift, key: 'loyalty', roles: ['owner', 'manager', 'waiter'] },
  { href: '/reports', icon: BarChart3, key: 'reports', roles: ['owner', 'manager'] },
  { href: '/branches', icon: Store, key: 'branches', roles: ['owner', 'manager'] },
  { href: '/landing', icon: Home, key: 'landing', roles: ['owner'] },
  { href: '/design', icon: Palette, key: 'design', roles: ['owner'] },
  { href: '/ordering', icon: ShoppingBag, key: 'ordering', roles: ['owner'] },
  { href: '/contact', icon: Phone, key: 'contact', roles: ['owner'] },
  { href: '/staff', icon: Users, key: 'staff', roles: ['owner'] },
  { href: '/domain', icon: Globe, key: 'domain', roles: ['owner'] },
  { href: '/billing', icon: CreditCard, key: 'billing', roles: ['owner'] },
] as const;

export function Sidebar({
  isSuperAdmin,
  role,
  menuUrl,
  locale,
}: {
  isSuperAdmin: boolean;
  role: MemberRole;
  menuUrl: string;
  locale: string;
}) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tDash = useTranslations('dashboard');
  const tAuth = useTranslations('auth');
  const [open, setOpen] = useState(false);

  const nav = (
    <nav className="flex flex-1 flex-col gap-1">
      {NAV.filter((item) => (item.roles as readonly string[]).includes(role)).map(
        ({ href, icon: Icon, key }) => (
          <NavLink key={href} href={href} active={pathname === href} icon={Icon} onClick={() => setOpen(false)}>
            {t(key)}
          </NavLink>
        ),
      )}
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
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white p-4 md:flex">
        <div className="mb-6 px-2 text-xl font-bold tracking-tight">Kuik</div>
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
            {nav}
            {footer}
          </div>
        </div>
      )}
    </>
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
