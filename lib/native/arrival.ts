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
const KEY = 'kuik:arrival';
const MAX_AGE_MS = 15_000;

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
