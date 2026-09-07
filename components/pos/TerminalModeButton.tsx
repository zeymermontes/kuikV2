'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LayoutGrid } from 'lucide-react';
import { shell } from '@/lib/native/shell';

const noop = () => () => {};

/**
 * The way back to the hub (/terminal) inside the Terminal and phone apps,
 * where there is no address bar. Renders nothing in a browser or on the
 * desktop, which has its own window chrome.
 */
export function TerminalModeButton() {
  const t = useTranslations('terminal');
  const inApp = useSyncExternalStore(
    noop,
    () => shell() === 'terminal' || shell() === 'mobile',
    () => false,
  );
  const pathname = usePathname();
  // The guest-facing screen shows no staff controls.
  if (!inApp || pathname.startsWith('/pos/customer')) return null;
  return (
    <Link
      href="/terminal"
      title={t('changeMode')}
      aria-label={t('changeMode')}
      className="fixed bottom-3 right-3 z-50 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/60 text-white/70 shadow backdrop-blur hover:text-white"
    >
      <LayoutGrid className="h-4 w-4" />
    </Link>
  );
}
