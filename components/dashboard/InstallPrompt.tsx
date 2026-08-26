'use client';

import { useState, useSyncExternalStore } from 'react';
import { Download, Share, Plus, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { usePwa } from './PwaProvider';

const DISMISSED = 'kuik.installPrompt.dismissed';

const listeners = new Set<() => void>();

const dismissedStore = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  },
  get() {
    try {
      return localStorage.getItem(DISMISSED) === '1';
    } catch {
      return false; // private mode: just offer it
    }
  },
  set() {
    try {
      localStorage.setItem(DISMISSED, '1');
    } catch {
      // nothing to do; it will offer again next session
    }
    listeners.forEach((l) => l());
  },
};

/**
 * Offer to install the dashboard. Android replays the browser's own prompt;
 * iOS has no programmatic equivalent — Add to Home Screen cannot be triggered
 * by script — so there it becomes an instruction sheet.
 */
export function InstallPrompt() {
  const t = useTranslations('pwa');
  const { canInstall, installed, isIos, install } = usePwa();
  const [showIosSheet, setShowIosSheet] = useState(false);
  // localStorage is external state that also has to render as "dismissed"
  // during SSR, so the card never flashes in before hydration.
  const dismissed = useSyncExternalStore(dismissedStore.subscribe, dismissedStore.get, () => true);

  function dismiss() {
    dismissedStore.set();
  }

  // On iOS there is no `beforeinstallprompt`, so `canInstall` is never true —
  // offer the sheet whenever we're in Safari and not already installed.
  const show = !installed && !dismissed && (canInstall || isIos);
  if (!show) return null;

  return (
    <>
      <div className="relative mx-3 mb-3 rounded-xl border border-neutral-200 bg-white p-3 text-neutral-900">
        <button onClick={dismiss} aria-label={t('later')}
          className="absolute right-1.5 top-1.5 rounded-full p-1 text-neutral-400 hover:bg-neutral-100">
          <X className="h-3.5 w-3.5" />
        </button>
        <p className="pr-5 text-sm font-semibold">{t('installTitle')}</p>
        <p className="mt-0.5 text-xs text-neutral-500">{t('installBody')}</p>
        <button
          onClick={() => (isIos ? setShowIosSheet(true) : install())}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          <Download className="h-4 w-4" /> {t('install')}
        </button>
      </div>

      {showIosSheet && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowIosSheet(false)} />
          <div className="relative w-full max-w-sm rounded-t-3xl bg-white p-5 text-neutral-900 sm:rounded-2xl">
            <h2 className="mb-3 text-lg font-bold">{t('installIosTitle')}</h2>
            <ol className="space-y-2.5 text-sm">
              <li className="flex items-start gap-2">
                <Share className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" /> {t('installIosStep1')}
              </li>
              <li className="flex items-start gap-2">
                <Plus className="mt-0.5 h-4 w-4 shrink-0 text-neutral-500" /> {t('installIosStep2')}
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 h-4 w-4 shrink-0" /> {t('installIosStep3')}
              </li>
            </ol>
            {/* An installed iOS web app gets its OWN cookie jar, so the hostess
                will land on the login screen again. Saying so up front stops
                that reading as a bug. */}
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t('installIosSignIn')}
            </p>
            <button onClick={() => setShowIosSheet(false)}
              className="mt-4 w-full rounded-full bg-neutral-900 py-2.5 text-sm font-semibold text-white">
              {t('gotIt')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
