'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { nativePush, shell } from '@/lib/native/shell';

const TOKEN_KEY = 'kuik_push_token';

/**
 * What the phone's push registration is doing, for a status line in the
 * hub: the one place a person can see why notifications are not arriving.
 * Kept on the window (and in localStorage) so the hub can read it whenever
 * it renders; `kuik:push-status` fires on every change.
 */
export type PushStatus =
  | { state: 'off' }            // the server has no keys for this platform
  | { state: 'no_plugin' }      // a shell built without the push plugin
  | { state: 'denied' }
  | { state: 'registering' }
  | { state: 'registered'; at: string }
  | { state: 'error'; detail: string };

export const PUSH_STATUS_KEY = 'kuik_push_status';
export const PUSH_STATUS_EVENT = 'kuik:push-status';

function setStatus(s: PushStatus) {
  try { localStorage.setItem(PUSH_STATUS_KEY, JSON.stringify(s)); } catch {}
  window.dispatchEvent(new CustomEvent(PUSH_STATUS_EVENT, { detail: s }));
}

export function readPushStatus(): PushStatus | null {
  try {
    const raw = localStorage.getItem(PUSH_STATUS_KEY);
    return raw ? (JSON.parse(raw) as PushStatus) : null;
  } catch {
    return null;
  }
}

/** Ask the shell to register again (the hub's "retry"). */
export const PUSH_RETRY_EVENT = 'kuik:push-retry';

/**
 * Inside the Kuik phone app (native/mobile), registers this device for
 * native push and posts the FCM token to /api/push/device. Re-posts on every
 * launch, so a rotated token replaces the old one. A tap on a notification
 * opens the URL it carries. Renders nothing; a no-op outside that shell.
 */
export function NativePush({ enabled }: { enabled: { android: boolean; ios: boolean } }) {
  const router = useRouter();
  const locale = useLocale();
  const android = enabled.android;
  const ios = enabled.ios;

  useEffect(() => {
    if (shell() !== 'mobile') return;
    // Only where Kuik can actually send: a shell built without Firebase
    // (no google-services.json) crashes the whole app on register(), and
    // without server keys a token would be useless anyway. The keys land
    // together with the build that carries the config.
    const platform = window.Capacitor?.getPlatform?.() === 'ios' ? 'ios' : 'android';
    if (!(platform === 'ios' ? ios : android)) {
      setStatus({ state: 'off' });
      return;
    }
    const push = nativePush();
    if (!push) {
      setStatus({ state: 'no_plugin' });
      return;
    }
    const handles: { remove: () => Promise<void> }[] = [];
    let cancelled = false;

    const register = async () => {
      setStatus({ state: 'registering' });
      const perm = await push.requestPermissions();
      if (perm.receive !== 'granted') {
        setStatus({ state: 'denied' });
        return;
      }
      await push.register();
    };

    (async () => {
      handles.push(
        await push.addListener('registration', (ev: { value: string }) => {
          const token = ev.value;
          let old: string | null = null;
          try {
            old = localStorage.getItem(TOKEN_KEY);
            localStorage.setItem(TOKEN_KEY, token);
          } catch {}
          fetch('/api/push/device', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token, platform, app: 'kuik', locale, oldToken: old !== token ? old : null }),
          })
            .then((r) => setStatus(r.ok ? { state: 'registered', at: new Date().toISOString() } : { state: 'error', detail: `HTTP ${r.status}` }))
            .catch((e) => setStatus({ state: 'error', detail: e instanceof Error ? e.message : 'fetch' }));
        }),
        await push.addListener('registrationError', (ev: { error?: string }) => {
          setStatus({ state: 'error', detail: ev?.error ?? 'registration' });
        }),
        await push.addListener('pushNotificationActionPerformed', (ev: { notification: { data?: { url?: string } } }) => {
          const url = ev.notification?.data?.url;
          if (typeof url === 'string' && url.startsWith('/')) router.push(url);
        }),
      );
      if (cancelled) return;
      await register();
    })().catch((e) => setStatus({ state: 'error', detail: e instanceof Error ? e.message : String(e) }));

    const onRetry = () => { register().catch((e) => setStatus({ state: 'error', detail: e instanceof Error ? e.message : String(e) })); };
    window.addEventListener(PUSH_RETRY_EVENT, onRetry);

    return () => {
      cancelled = true;
      window.removeEventListener(PUSH_RETRY_EVENT, onRetry);
      for (const h of handles) void h.remove();
    };
  }, [locale, router, android, ios]);

  return null;
}
