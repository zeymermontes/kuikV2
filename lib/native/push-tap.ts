// A tap on a push is acted on once.
//
// On Android the activity is relaunched with the very intent that first
// opened it: killed in the background and opened again from its icon or from
// recents, the app comes back carrying the notification tap of days ago, and
// the push plugin hands it to the page again as a fresh tap. Seen as "every
// time I open the app it opens that chat", until the task is swiped away.
// The ids of the taps already acted on are kept, and a repeat is ignored.

/** How many taps are remembered; a phone gets a handful a day. */
export const REMEMBERED_TAPS = 30;

/**
 * The list with `id` added, or null when it was already in it (the tap was
 * acted on before and must be ignored). Newest last, oldest dropped.
 */
export function rememberTap(id: string, seen: readonly string[]): string[] | null {
  if (!id) return [...seen];
  if (seen.includes(id)) return null;
  const next = [...seen, id];
  return next.length > REMEMBERED_TAPS ? next.slice(next.length - REMEMBERED_TAPS) : next;
}

/**
 * What tells one tap from another: the message id FCM gives every push. A
 * tap without one (nothing to compare) is never treated as a repeat.
 */
export function tapId(notification: { id?: unknown; data?: Record<string, unknown> } | null | undefined): string {
  const id = notification?.id;
  if (typeof id === 'string' && id) return id;
  const msg = notification?.data?.['google.message_id'];
  return typeof msg === 'string' ? msg : '';
}
