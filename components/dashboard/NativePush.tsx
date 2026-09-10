'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { nativePush, shell } from '@/lib/native/shell';

const TOKEN_KEY = 'kuik_push_token';

/**
 * Inside the Kuik phone app (native/mobile), registers this device for
 * native push and posts the FCM token to /api/push/device. Re-posts on every
 * launch, so a rotated token replaces the old one. A tap on a notification
 * opens the URL it carries. Renders nothing; a no-op outside that shell.
 */
export function NativePush({ enabled }: { enabled: { android: boolean; ios: boolean } }) {
  const router = useRouter();
  const locale = useLocale();

  useEffect(() => {
    if (shell() !== 'mobile') return;
    // Only where Kuik can actually send: a shell built without Firebase
    // (no google-services.json) crashes the whole app on register(), and
    // without server keys a token would be useless anyway. The keys land
    // together with the build that carries the config.
    const platform = window.Capacitor?.getPlatform?.() === 'ios' ? 'ios' : 'android';
    if (!enabled[platform]) return;
    const push = nativePush();
    if (!push) return;
    const handles: { remove: () => Promise<void> }[] = [];
    let cancelled = false;

    (async () => {
      handles.push(
        await push.addListener('registration', (ev: { value: string }) => {
          const token = ev.value;
          let old: string | null = null;
          try {
            old = localStorage.getItem(TOKEN_KEY);
            localStorage.setItem(TOKEN_KEY, token);
          } catch {}
          const platform = window.Capacitor?.getPlatform?.() === 'ios' ? 'ios' : 'android';
          void fetch('/api/push/device', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ token, platform, app: 'kuik', locale, oldToken: old !== token ? old : null }),
          }).catch(() => {});
        }),
        await push.addListener('pushNotificationActionPerformed', (ev: { notification: { data?: { url?: string } } }) => {
          const url = ev.notification?.data?.url;
          if (typeof url === 'string' && url.startsWith('/')) router.push(url);
        }),
      );
      if (cancelled) return;
      const perm = await push.requestPermissions();
      if (perm.receive === 'granted') await push.register();
    })().catch(() => {});

    return () => {
      cancelled = true;
      for (const h of handles) void h.remove();
    };
  }, [locale, router, enabled]);

  return null;
}
