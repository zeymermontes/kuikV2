/**
 * A note left by the tap that starts a navigation to a fully prefetched
 * page (a hub tile, Android back to the hub), read by the page that mounts.
 *
 * A prefetched page appears at once but may be minutes old; the note is how
 * the destination knows it should fetch itself again. It lives in
 * sessionStorage because the source and the destination are different
 * layouts, and it expires fast so a tap that never navigated does not make
 * some later page refresh for no reason.
 */
import { PrefetchKind } from 'next/dist/client/components/router-reducer/router-reducer-types';

/**
 * The option that makes `router.prefetch()` fetch the whole page.
 *
 * `<Link prefetch={true}>` does that on its own, but `router.prefetch()`
 * defaults to the partial kind: only the layout down to the loading state.
 * Navigating on a partial prefetch still shows the spinner and waits for the
 * server, which is exactly what a full prefetch is there to avoid. The kind
 * is not exported from `next/navigation`, hence the deep import: if a Next
 * upgrade moves it the build fails here, rather than the app quietly going
 * back to partial prefetches.
 */
export const FULL_PREFETCH = { kind: PrefetchKind.FULL } as const;

const KEY = 'kuik:arrival';
const MAX_AGE_MS = 15_000;

/** How long a full prefetch is kept by the router before it is fetched again (staleTimes.static). */
export const PREFETCH_TTL_MS = 5 * 60_000;
/** A page prefetched this recently is as good as one fetched on the tap. */
const FRESH_ENOUGH_MS = 15_000;

/**
 * Whether a page prefetched at `fetchedAt` should fetch itself again once
 * shown. Not always: `router.refresh()` discards every prefetch the router
 * holds, the way back to the hub included, so it is spent only on a page
 * that is actually old.
 */
export function needsRefresh(fetchedAt: number, now: number = Date.now()): boolean {
  return now - fetchedAt > FRESH_ENOUGH_MS;
}

/** Fired on `window` when a section has finished fetching itself again. */
export const FRESH_EVENT = 'kuik:fresh';

export function markArrival(): void {
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // no storage: the page simply shows what was prefetched
  }
}

/** True once, for a note left moments ago. */
export function takeArrival(now: number = Date.now()): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return false;
    sessionStorage.removeItem(KEY);
    return isRecent(raw, now);
  } catch {
    return false;
  }
}

export function isRecent(raw: string, now: number): boolean {
  const at = Number(raw);
  return Number.isFinite(at) && at > 0 && now - at >= 0 && now - at < MAX_AGE_MS;
}
