'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Cable, Inbox, Lock, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/whatsapp', key: 'connection', icon: Cable, pro: false },
  { href: '/whatsapp/flows', key: 'flows', icon: Workflow, pro: true },
  { href: '/whatsapp/inbox', key: 'inbox', icon: Inbox, pro: true },
] as const;

/**
 * Sub-navigation for the WhatsApp section. Pro tabs stay VISIBLE on basic —
 * with a small lock — and land on the upsell; hiding them would hide the
 * reason to upgrade.
 */
export function WhatsappTabs({ pro, children }: { pro: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const t = useTranslations('whatsapp.tabs');

  // The canvas editor (/whatsapp/flows/<id>) takes the whole viewport.
  const editor = /^\/whatsapp\/flows\/[^/]+$/.test(pathname);
  if (editor) return <>{children}</>;

  return (
    <div className="space-y-5">
      <div className="flex gap-1 rounded-xl border border-neutral-200 bg-white p-1 sm:w-fit">
        {TABS.map(({ href, key, icon: Icon, pro: needsPro }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition sm:flex-none',
                active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100',
              )}
            >
              <Icon className="h-4 w-4" />
              {t(key)}
              {needsPro && !pro && <Lock className="h-3 w-3 text-amber-500" />}
            </Link>
          );
        })}
      </div>
      {children}
    </div>
  );
}
