// What the chats app lists under each of its two views. Pure, so the order
// is tested rather than eyeballed.

export type ChatView = 'waiting' | 'all';

export interface ListedChat {
  /** The bot stepped aside and nobody has picked up. */
  waiting: boolean;
  /** The last message's time. */
  lastAt: string | null;
  /** What the restaurant still owes the chat: a question to answer, a booking to accept. */
  pending?: { questions: number; bookings: number } | null;
}

/** A chat a person has to do something about: it asked for one, or it is owed something. */
export function needsPerson(row: ListedChat): boolean {
  return row.waiting || (row.pending ? row.pending.questions + row.pending.bookings > 0 : false);
}

/**
 * Whether a message is a person at the restaurant answering: sent from the
 * panel or the apps, or typed on the restaurant's own phone. Not the bot's
 * "someone will be with you", which leaves the diner still waiting.
 */
export function isStaffReply(m: { direction: string; origin: string }): boolean {
  return m.direction === 'outbound' && (m.origin === 'staff_dashboard' || m.origin === 'staff_device');
}

export type ChatTone = 'needsReply' | 'answered' | 'idle';

/**
 * What a row's badge says at a glance. A chat waiting for a person is
 * yellow while the diner has the last word (or only the bot has spoken),
 * and blue once somebody from the restaurant answered: still open, but the
 * next move is the diner's. Everything else is quiet.
 */
export function chatTone(row: { waiting: boolean; staffReplied: boolean; pending?: ListedChat['pending'] }): ChatTone {
  // Something written down as owed stays yellow until somebody closes it,
  // whoever spoke last.
  if (row.pending && row.pending.questions + row.pending.bookings > 0) return 'needsReply';
  if (!row.waiting) return 'idle';
  return row.staffReplied ? 'answered' : 'needsReply';
}

const newestFirst = (a: string | null, b: string | null) => (a === b ? 0 : (b ?? '') > (a ?? '') ? 1 : -1);

/**
 * "Waiting for a person": the chats that asked for one, and the ones owed
 * something (a question left to answer, a booking to accept). "Recent":
 * everybody. Both by their last message, newest first.
 *
 * Recent used to keep the waiting chats on top. With a screenful of them
 * waiting, the two views then opened on the very same rows and the switch
 * looked broken. A waiting chat is still marked in the recent view; it just
 * takes its place in time like the rest.
 */
export function chatsFor<T extends ListedChat>(rows: T[], view: ChatView): T[] {
  const shown = view === 'waiting' ? rows.filter(needsPerson) : [...rows];
  return shown.sort((a, b) => newestFirst(a.lastAt, b.lastAt));
}
