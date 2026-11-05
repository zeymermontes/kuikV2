'use client';

import { useEffect, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { capacitorPlugin, shell } from '@/lib/native/shell';
import { backAction, HUB_PATH } from '@/lib/native/back';

/**
 * Android's back button inside the Terminal and phone apps. On a section's
 * first screen (the door, the register, the chats, the admin home) it goes
 * back to the hub; deeper in, it goes back one page, and to the hub when
 * there is nothing behind; on the hub itself it puts the app in the
 * background and goes no further. Mounted on the hub too: without a
 * listener there, Capacitor's default walks the WebView history and reopens
 * the section left last. Replaces the floating hub button, which sat on
 * top of controls the sections put in that corner. Renders nothing; a no-op
 * in a browser (which has its own back) and on iOS (which has no button).
 */

export function ShellBackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [leaving, startLeaving] = useTransition();

  // The way back is known in advance: have the hub's frame ready, so back
  // from a section lands at once instead of after a server round trip.
  useEffect(() => {
    if (shell() !== 'terminal' && shell() !== 'mobile') return;
    if ((pathname.replace(/\/+$/, '') || '/') === HUB_PATH) return;
    try {
      router.prefetch(HUB_PATH);
    } catch {}
  }, [pathname, router]);

  useEffect(() => {
    if (shell() !== 'terminal' && shell() !== 'mobile') return;
    let handle: { remove: () => Promise<void> } | null = null;
    let cancelled = false;
    // Nothing here may throw into React: a shell without the plugin, or a
    // proxy that behaves unexpectedly, must cost the back button, not the page.
    try {
      const app = capacitorPlugin('App');
      if (!app?.addListener) return;
      const listen = app.addListener as (ev: string, cb: (e: { canGoBack: boolean }) => void) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
      Promise.resolve(listen('backButton', ({ canGoBack }) => {
        const action = backAction(pathname, canGoBack);
        if (action === 'minimize') {
          // A shell too old to know the call simply stays on the hub.
          try {
            void Promise.resolve(app.minimizeApp?.()).catch(() => {});
          } catch {}
        } else if (action === 'hub') {
          // Replace, not push: the section just left must not sit behind the hub.
          startLeaving(() => router.replace(HUB_PATH));
        } else {
          window.history.back();
        }
      }))
        .then((h) => {
          if (!h || typeof h.remove !== 'function') return;
          if (cancelled) void h.remove();
          else handle = h;
        })
        .catch(() => {});
    } catch {
      return;
    }
    return () => {
      cancelled = true;
      if (handle) void handle.remove();
    };
  }, [pathname, router]);

  // Back was pressed and the hub is on its way: say so, so the press does
  // not look ignored on a slow connection.
  if (!leaving) return null;
  return (
    <div role="status" aria-busy="true" className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-black/40">
      <Loader2 className="h-7 w-7 animate-spin text-white" />
    </div>
  );
}
