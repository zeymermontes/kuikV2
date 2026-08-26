'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { useTranslations, useLocale } from 'next-intl';
import { usePwa } from './PwaProvider';

type State = 'loading' | 'unsupported' | 'ios-needs-install' | 'blocked' | 'off' | 'on';

/** base64url → Uint8Array, the shape applicationServerKey wants. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Turn reservation alerts on for this device.
 *
 * The iOS caveats are load-bearing, not trivia: Web Push there needs 16.4+ AND
 * the app added to the Home Screen — a Safari tab silently receives nothing.
 * So rather than showing a switch that does nothing, we detect that case and
 * point at the install sheet.
 */
export function PushToggle() {
  const t = useTranslations('reservations');
  const locale = useLocale();
  const { installed, isIos } = usePwa();
  const [state, setState] = useState<State>('loading');
  const [busy, setBusy] = useState(false);

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  /**
   * Work out the current state without touching React, so the effect can do a
   * single assignment at the end. Returns null when the component unmounted
   * mid-flight is no longer relevant — the caller checks a cancel flag.
   */
  const resolve = useCallback(async (): Promise<State> => {
    if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return 'unsupported';
    }
    if (isIos && !installed) return 'ios-needs-install';
    if (Notification.permission === 'denied') return 'blocked';
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return 'off';
      // Re-post on every load: it refreshes last_seen_at and self-heals a
      // rotated endpoint on Safari, which doesn't fire pushsubscriptionchange.
      void fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), locale }),
      }).catch(() => {});
      return 'on';
    } catch {
      return 'off';
    }
  }, [publicKey, isIos, installed, locale]);

  useEffect(() => {
    let cancelled = false;
    void resolve().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [resolve]);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    try {
      // MUST be called from the click itself — iOS rejects it otherwise.
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'blocked' : 'off');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), locale }),
      });
      setState(res.ok ? 'on' : 'off');
    } catch {
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe();
      }
      setState('off');
    } finally {
      setBusy(false);
    }
  }

  if (state === 'loading' || state === 'unsupported') return null;

  const chip = 'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium';

  if (state === 'ios-needs-install') {
    return (
      <span className={`${chip} border-neutral-200 text-neutral-500`} title={t('push_iosHint')}>
        <BellOff className="h-4 w-4" /> {t('push_iosHint')}
      </span>
    );
  }

  if (state === 'blocked') {
    // Once denied, the page cannot ask again — only the browser's own settings
    // can undo it. Say that instead of offering a button that does nothing.
    return (
      <span className={`${chip} border-neutral-200 text-neutral-500`} title={t('push_blocked')}>
        <BellOff className="h-4 w-4" /> {t('push_blocked')}
      </span>
    );
  }

  return state === 'on' ? (
    <button onClick={disable} disabled={busy} className={`${chip} border-green-300 bg-green-50 text-green-700`}>
      <BellRing className="h-4 w-4" /> {t('push_enabled')}
    </button>
  ) : (
    <button onClick={enable} disabled={busy} className={`${chip} border-neutral-300 text-neutral-600 hover:bg-neutral-50`}>
      <Bell className="h-4 w-4" /> {t('push_enable')}
    </button>
  );
}
