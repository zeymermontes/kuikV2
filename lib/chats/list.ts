// What the chats app lists under each of its two views. Pure, so the order
// is tested rather than eyeballed.

export type ChatView = 'waiting' | 'all';

export interface ListedChat {
  /** The bot stepped aside and nobody has picked up. */
  waiting: boolean;
  /** The last message's time. */
  lastAt: string | null;
}

const newestFirst = (a: string | null, b: string | null) => (a === b ? 0 : (b ?? '') > (a ?? '') ? 1 : -1);

/**
 * "Waiting for a person": only those. "Recent": everybody. Both by their
 * last message, newest first.
 *
 * Recent used to keep the waiting chats on top. With a screenful of them
 * waiting, the two views then opened on the very same rows and the switch
 * looked broken. A waiting chat is still marked in the recent view; it just
 * takes its place in time like the rest.
 */
export function chatsFor<T extends ListedChat>(rows: T[], view: ChatView): T[] {
  const shown = view === 'waiting' ? rows.filter((r) => r.waiting) : [...rows];
  return shown.sort((a, b) => newestFirst(a.lastAt, b.lastAt));
}
