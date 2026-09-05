'use client';

import { useCallback, useSyncExternalStore } from 'react';

// Same-tab listeners; the `storage` event only fires in OTHER tabs.
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * A boolean the visitor owns, remembered on this device.
 *
 * useSyncExternalStore rather than useState+useEffect: the server snapshot is
 * always false, the client reads localStorage on its first render, and React
 * reconciles the two without a setState-in-effect or a hydration warning.
 */
export function useLocalFlag(key: string): [boolean, (value: boolean) => void] {
  const subscribe = useCallback(
    (cb: () => void) => {
      listeners.add(cb);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) cb();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(cb);
        window.removeEventListener('storage', onStorage);
      };
    },
    [key],
  );
  const read = useCallback(() => {
    try {
      return localStorage.getItem(key) === '1';
    } catch {
      return false;
    }
  }, [key]);
  const value = useSyncExternalStore(subscribe, read, () => false);
  const set = useCallback(
    (v: boolean) => {
      try {
        if (v) localStorage.setItem(key, '1');
        else localStorage.removeItem(key);
      } catch {
        // Private mode: the toggle still works for this page view.
      }
      emit();
    },
    [key],
  );
  return [value, set];
}
