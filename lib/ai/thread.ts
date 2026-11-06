// The stored conversation, as the thread the model reads. Pure, and done here
// rather than in the query on purpose: see `threadFrom`.

import type { ChatMessage } from './types';

export interface StoredMessage {
  direction: string;
  body: string | null;
  /** Delivery state of what the restaurant sent. A diner's message has none. */
  status?: string | null;
}

/**
 * `rows` come newest first, as fetched; the thread goes out oldest first and
 * holds the last `limit` messages that count.
 *
 * A reply that never left is not something the model said: with it in the
 * thread, a greeting that failed to send turns the next "hola" into "hola de
 * nuevo". That filter used to live in the query as `status <> 'failed'`, and
 * a diner's message has no status at all, so the database dropped every one
 * of them: for weeks the model answered having read only its own side. The
 * filter is here now, where a missing status means what it should.
 *
 * `current` is what this turn answers (one message, or several sent in a
 * row). It is always in the thread; if for any reason the stored rows do not
 * carry it, it is added at the end, so the model can never again be asked to
 * reply to something it was not shown.
 */
export function threadFrom(rows: StoredMessage[], opts: { limit: number; current?: string }): ChatMessage[] {
  const thread: ChatMessage[] = [];
  const kept = rows
    .filter((m) => m.body && m.status !== 'failed')
    .slice(0, Math.max(0, opts.limit))
    .reverse();
  for (const m of kept) {
    const role = m.direction === 'inbound' ? 'user' : 'assistant';
    const last = thread[thread.length - 1];
    // Someone who answers in three short messages said one thing: it reaches
    // the model as one turn, a line per message. (Several providers also
    // refuse two turns in a row from the same side.)
    if (last && last.role === role) last.content = `${last.content}\n${m.body!}`;
    else thread.push({ role, content: m.body! });
  }

  const current = (opts.current ?? '').trim();
  const lastUser = [...thread].reverse().find((m) => m.role === 'user');
  if (current && !(lastUser && squash(lastUser.content).includes(squash(current)))) {
    const last = thread[thread.length - 1];
    if (last?.role === 'user') last.content = `${last.content}\n${current}`;
    else thread.push({ role: 'user', content: current });
  }
  return thread;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
