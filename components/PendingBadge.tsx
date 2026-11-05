'use client';

import { useEffect } from 'react';
import { watchPending } from '@/lib/pending-live';
import { setTabCount } from '@/lib/tab-title';
import { capacitorPlugin, shell } from '@/lib/native/shell';

interface BadgeNavigator {
  setAppBadge?: (n?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
}

// Whether the phone's notifications were already cleared for the current
// run of "nothing waiting": once per run, not on every count.
let trayCleared = false;

/**
 * The number of things waiting for a person, wherever a device shows one
 * outside the page, and kept right as they come and go:
 *
 *  - the tab's title, "(3) Kuik", for a browser left open behind other tabs;
 *  - the icon of the installed web app (setAppBadge), where the browser has one;
 *  - the phone app's icon. Android draws that from the notifications in the
 *    tray, which a page cannot renumber; what it can do is take them away
 *    once nothing is waiting any more, so the icon stops saying otherwise.
 *
 * The hub's tiles listen to the same counts (lib/pending-live.ts). Renders
 * nothing; mounted with the staff alerts on every staff screen.
 */
export function usePendingBadge(tenantId: string): void {
  useEffect(() => {
    const stop = watchPending(tenantId, ({ bookings, chats }) => {
      const total = bookings + chats;
      setTabCount('pending', total);

      const nav = navigator as Navigator & BadgeNavigator;
      try {
        const p = total > 0 ? nav.setAppBadge?.(total) : nav.clearAppBadge?.();
        p?.catch(() => {});
      } catch {
        // no badge on this browser
      }

      if (total > 0) trayCleared = false;
      else if (!trayCleared && shell() === 'mobile') {
        trayCleared = true;
        capacitorPlugin('PushNotifications')
          ?.removeAllDeliveredNotifications?.()
          ?.catch(() => {});
      }
    });
    return () => {
      stop();
      setTabCount('pending', 0);
    };
  }, [tenantId]);
}
