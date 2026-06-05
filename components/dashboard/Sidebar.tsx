'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Palette,
  ShoppingBag,
  Phone,
  Globe,
  CreditCard,
  Shield,
  ExternalLink,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from '@/app/(auth)/actions';
import { LocaleSwitch } from './LocaleSwitch';

const NAV = [
  { href: '/dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { href: '/menu', icon: UtensilsCrossed, key: 'menu' },
  { href: '/design', icon: Palette, key: 'design' },
  { href: '/ordering', icon: ShoppingBag, key: 'ordering' },
  { href: '/contact', icon: Phone, key: 'contact' },
  { href: '/domain', icon: Globe, key: 'domain' },
  { href: '/billing', icon: CreditCard, key: 'billing' },
] as const;

export function Sidebar({
  isSuperAdmin,
  menuUrl,
  locale,
}: {
  isSuperAdmin: boolean;
  menuUrl: string;
  locale: string;
}) {
  const pathname = usePathname();
  const t = useTranslations('nav');
  const tDash = useTranslations('dashboard');
  const tAuth = useTranslations('auth');

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white p-4 md:flex">
        <div className="mb-6 px-2 text-xl font-bold tracking-tight">Kuik</div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV.map(({ href, icon: Icon, key }) => (
            <NavLink key={href} href={href} active={pathname === href} icon={Icon}>
              {t(key)}
            </NavLink>
          ))}
          {isSuperAdmin && (
            <NavLink href="/admin" active={pathname.startsWith('/admin')} icon={Shield}>
              {t('superAdmin')}
            </NavLink>
          )}
        </nav>

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
      </aside>

      {/* Mobile bottom nav */}
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-neutral-200 bg-white py-2 md:hidden">
        {NAV.map(({ href, icon: Icon, key }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex flex-col items-center gap-0.5 px-2 py-1 text-[10px]',
              pathname === href ? 'text-neutral-900' : 'text-neutral-400',
            )}
          >
            <Icon className="h-5 w-5" />
            {t(key)}
          </Link>
        ))}
        {isSuperAdmin && (
          <Link
            href="/admin"
            className={cn(
              'flex flex-col items-center gap-0.5 px-2 py-1 text-[10px]',
              pathname.startsWith('/admin') ? 'text-neutral-900' : 'text-neutral-400',
            )}
          >
            <Shield className="h-5 w-5" />
            {t('superAdmin')}
          </Link>
        )}
      </nav>
    </>
  );
}

function NavLink({
  href,
  active,
  icon: Icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
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
