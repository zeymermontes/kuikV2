'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { capacitorPlugin, shell } from '@/lib/native/shell';

/**
 * Android's back button inside the Terminal and phone apps. On a section's
 * first screen (the door, the register, the chats, the admin home) it goes
 * back to the hub; deeper in, it goes back one page, and to the hub when
 * there is nothing behind. Replaces the floating hub button, which sat on
 * top of controls the sections put in that corner. Renders nothing; a no-op
 * in a browser (which has its own back) and on iOS (which has no button).
 */
const SECTION_HOMES = new Set(['/host', '/pos', '/kds', '/chats', '/orders', '/dashboard']);

export function ShellBackButton() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (shell() !== 'terminal' && shell() !== 'mobile') return;
    const app = capacitorPlugin('App');
    if (!app?.addListener) return;
    let handle: { remove: () => Promise<void> } | null = null;
    let cancelled = false;
    const listen = app.addListener as (ev: string, cb: (e: { canGoBack: boolean }) => void) => Promise<{ remove: () => Promise<void> }>;
    listen('backButton', ({ canGoBack }) => {
      const here = pathname.replace(/\/+$/, '') || '/';
      if (SECTION_HOMES.has(here) || !canGoBack) router.push('/terminal');
      else window.history.back();
    })
      .then((h) => {
        if (cancelled) void h.remove();
        else handle = h;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (handle) void handle.remove();
    };
  }, [pathname, router]);

  return null;
}
