'use client';

import { useEffect } from 'react';
import { nativePush, shell } from '@/lib/native/shell';
import { rememberTap, tapId } from '@/lib/native/push-tap';

/** The taps already acted on (lib/native/push-tap.ts). */
const TAPS_KEY = 'kuik_push_taps';

/**
 * Whether this tap is a new one. Android relaunches the app with the intent
 * that first opened it, notification tap included, so the same tap arrives
 * again on every cold start until the task is swiped away; acting on it
 * again would open that chat every time. Without storage every tap counts.
 */
function firstTap(notification: { id?: unknown; data?: Record<string, unknown> } | undefined): boolean {
  const id = tapId(notification);
  if (!id) return true;
  try {
    const seen = JSON.parse(localStorage.getItem(TAPS_KEY) ?? '[]');
    const next = rememberTap(id, Array.isArray(seen) ? seen.filter((s): s is string => typeof s === 'string') : []);
    if (!next) return false;
    localStorage.setItem(TAPS_KEY, JSON.stringify(next));
  } catch {
    // no storage: better a repeated open than a tap that does nothing
  }
  return true;
}

/**
 * Inside the phone app (native/mobile), a tap on a notification opens the
 * URL it carries. Mounted by every staff screen, not only the hub: the
 * plugin hands the tap to whatever page is open, and holds it until some
 * page listens. With the app parked on the chats or the host stand, a tap
 * used to bring the app forward and nothing else, until a visit to the hub
 * (the only listener) replayed it. Renders nothing; a no-op outside the shell.
 */
export function NativePushTap() {
  useEffect(() => {
    if (shell() !== 'mobile') return;
    const push = nativePush();
    if (!push) return;
    let handle: { remove: () => Promise<void> } | null = null;
    let cancelled = false;
    // Promise.resolve, not `.then` on the call: the shells already installed
    // hand back the handle itself, not a promise, and `.then` on it threw
    // inside this effect and took the whole screen down to "Algo salió mal".
    // Nothing here may throw: a tap that cannot be heard is a tap, a page
    // that cannot open is everyone's problem.
    try {
      Promise.resolve(
        push.addListener('pushNotificationActionPerformed', (ev: { notification: { id?: unknown; data?: Record<string, unknown> } }) => {
          // A replayed tap (see firstTap) opens nothing: the app starts on
          // the hub as on any other launch.
          if (!firstTap(ev.notification)) return;
          // A full navigation, not router.push: the URL goes through /open,
          // which may switch the active restaurant, and then everything on
          // screen belongs to the other one (see tenant-actions.ts).
          const url = ev.notification?.data?.url;
          if (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//')) window.location.assign(url);
        }),
      )
        .then((h) => {
          if (!h || typeof h.remove !== 'function') return;
          if (cancelled) void h.remove();
          else handle = h;
        })
        .catch(() => {});
    } catch {
      // a shell without the event: the hub's own listener still runs
    }
    return () => {
      cancelled = true;
      if (handle) void handle.remove();
    };
  }, []);
  return null;
}
