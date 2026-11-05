'use client';

import { Fragment, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FRESH_EVENT, takeArrival } from '@/lib/native/arrival';

/**
 * Wraps a section's page. When the page was reached through a full prefetch
 * (lib/native/arrival.ts), it is on screen at once but may be a few minutes
 * old, so it is fetched again in the background.
 *
 * Fetching again is not enough on its own: the host stand, the chats and
 * the kitchen copy their first data into state, and state ignores new
 * props. So once the fresh data has arrived the page is mounted anew (a new
 * key), which is what makes those screens start from it. The order matters:
 * remounting before the refresh lands would only restart them on the old data.
 */
export function FreshOnArrival({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [epoch, setEpoch] = useState(0);
  const phase = useRef<'idle' | 'asked' | 'running'>('idle');

  useEffect(() => {
    if (!takeArrival()) return;
    // Without a network there is nothing fresher to fetch, and a refresh
    // that fails makes the router fall back to a full page load: the
    // register would trade a working screen for a reload it cannot finish.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    phase.current = 'asked';
    start(() => router.refresh());
    // on mount only: the note is taken once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase.current === 'asked' && pending) phase.current = 'running';
    else if (phase.current === 'running' && !pending) {
      phase.current = 'idle';
      setEpoch((e) => e + 1);
      // The refresh discarded every prefetch the router held: whoever keeps
      // one at hand (the way back to the hub) asks for it again now.
      window.dispatchEvent(new Event(FRESH_EVENT));
    }
  }, [pending]);

  return <Fragment key={epoch}>{children}</Fragment>;
}
