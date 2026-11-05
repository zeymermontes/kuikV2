'use client';

import { useEffect } from 'react';
import { recheckInsets } from '@/lib/native/insets';

/**
 * Keeps the page out from under Android's status bar inside the apps
 * (lib/native/insets.ts): asks the shell to look again when the page mounts,
 * when it is restored from the history and when the app returns to the
 * front, the moments its remembered answer can be stale. Renders nothing.
 */
export function useShellInsets(): void {
  useEffect(() => {
    recheckInsets();
    const onVisible = () => {
      if (document.visibilityState === 'visible') recheckInsets();
    };
    window.addEventListener('pageshow', recheckInsets);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('pageshow', recheckInsets);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

export function ShellInsets() {
  useShellInsets();
  return null;
}
