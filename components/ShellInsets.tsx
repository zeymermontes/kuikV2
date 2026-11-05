'use client';

import { useEffect } from 'react';
import { keepBelowStatusBar, recheckInsets } from '@/lib/native/insets';

/**
 * Keeps the page out from under Android's status bar inside the apps
 * (lib/native/insets.ts), both ways it can get there: asks the shell to
 * look again at who pads, and tells the phone app's status bar plugin not to
 * let the page run behind it. On mount, when the page is restored from the
 * history, when the app returns to the front and after a rotation. Renders
 * nothing.
 */
export function useShellInsets(): void {
  useEffect(() => {
    const fit = () => {
      recheckInsets();
      void keepBelowStatusBar();
    };
    fit();
    const onVisible = () => {
      if (document.visibilityState === 'visible') fit();
    };
    // A rotation resets the status bar's icons to the system theme's.
    let turning: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (turning) clearTimeout(turning);
      turning = setTimeout(fit, 300);
    };
    window.addEventListener('pageshow', fit);
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (turning) clearTimeout(turning);
      window.removeEventListener('pageshow', fit);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

export function ShellInsets() {
  useShellInsets();
  return null;
}
