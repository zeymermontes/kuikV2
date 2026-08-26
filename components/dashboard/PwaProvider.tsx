'use client';

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';

/**
 * Registers the dashboard service worker and tracks whether the app can be
 * installed. Mounted once in the dashboard layout.
 *
 * Scope is '/', which coexists with the /pos worker: the most specific matching
 * scope controls a client, so POS pages keep sw-pos.js.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PwaState {
  /** True once the browser has offered us an install prompt to replay. */
  canInstall: boolean;
  /** Already running from the home screen / app window. */
  installed: boolean;
  /** iOS gives no programmatic install; the UI has to explain the steps. */
  isIos: boolean;
  install: () => Promise<void>;
}

const Ctx = createContext<PwaState>({
  canInstall: false,
  installed: false,
  isIos: false,
  install: async () => {},
});

export const usePwa = () => useContext(Ctx);

/**
 * Whether we are running as an installed app. Read through
 * useSyncExternalStore rather than an effect: it is external browser state,
 * it can change while the page is open (iOS launches into standalone), and it
 * has to render as `false` during SSR without a hydration mismatch.
 */
const standaloneStore = {
  subscribe(onChange: () => void) {
    const mq = window.matchMedia('(display-mode: standalone)');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  },
  get() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  },
};

const iosStore = {
  subscribe() {
    return () => {}; // the user agent does not change mid-session
  },
  get() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window);
  },
};

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const installed = useSyncExternalStore(standaloneStore.subscribe, standaloneStore.get, () => false);
  const isIos = useSyncExternalStore(iosStore.subscribe, iosStore.get, () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it so we can replay it from our own button
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if ('serviceWorker' in navigator) {
      // Push needs a registered worker, which makes it untestable in dev unless
      // we opt in. NEXT_PUBLIC_SW_DEV=1 turns it on locally; the worker skips
      // its own fetch handler there, so it never serves stale Turbopack bundles.
      const devSw = process.env.NEXT_PUBLIC_SW_DEV === '1';
      if (process.env.NODE_ENV === 'production' || devSw) {
        navigator.serviceWorker.register('/sw-app.js', { scope: '/' }).catch(() => {});
      } else {
        // In dev, an active worker would serve stale Turbopack bundles. Clear
        // ours out — matching what PosTerminal does for /pos — but leave the
        // POS registration alone, since its scope is not ours.
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) =>
            regs
              .filter((r) => !r.scope.includes('/pos'))
              .forEach((r) => void r.unregister()),
          )
          .catch(() => {});
        caches?.keys?.()
          .then((keys) => keys.filter((k) => k.startsWith('kuik-app')).forEach((k) => void caches.delete(k)))
          .catch(() => {});
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    // Whatever the outcome, a captured prompt can only be replayed once; the
    // display-mode store notices if the install actually happened.
    setDeferred(null);
  }, [deferred]);

  return (
    <Ctx.Provider value={{ canInstall: Boolean(deferred), installed, isIos, install }}>
      {children}
    </Ctx.Provider>
  );
}
