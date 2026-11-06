// People answer in bursts: "13", "el sábado", "a las 8", three messages in
// five seconds. Answering each one as it lands made the bot talk over them,
// three replies racing each other, each written without the other two. Here a
// message waits a moment for company, and whatever arrived together is
// answered once, together.
//
// In-process on purpose: this is one long-running server, the wait is a few
// seconds, and a message whose wait is lost to a restart is exactly as lost
// as a reply cut short by one was before.

export interface PendingPart {
  /** The stored message's id. */
  id: string;
  text: string;
  /** Tapped button or list row. */
  replyId?: string | null;
  /** A voice note nobody could transcribe. */
  kind?: 'audio_unreadable';
}

/** A fragment ("13", "el sábado", "hola"): more is probably on its way. */
export const SETTLE_FRAGMENT_MS = 4_000;
/** A whole sentence: a short pause is enough to catch an afterthought. */
export const SETTLE_SENTENCE_MS = 2_000;
/** However many messages keep coming, the first one is answered by then. */
export const SETTLE_MAX_MS = 20_000;

/**
 * How long a message waits for the next one.
 *
 * A tap is a finished answer and waits for nothing. Typed text waits longer
 * the more it looks like a piece of something: a few words with no question
 * in them are usually the first of several.
 */
export function settleMs(part: Pick<PendingPart, 'text' | 'replyId' | 'kind'>): number {
  if (part.replyId || part.kind === 'audio_unreadable') return 0;
  const text = part.text.trim();
  const words = text.split(/\s+/).filter(Boolean).length;
  // Several lines are already a whole answer; so is a question.
  const whole = words > 4 || text.includes('\n') || /[?¿]/.test(text);
  return whole ? SETTLE_SENTENCE_MS : SETTLE_FRAGMENT_MS;
}

interface Waiting {
  parts: PendingPart[];
  /** When the oldest message of the batch arrived. */
  since: number;
}

export interface Settler {
  /**
   * Hand over a message. Resolves once the batch it ended up in has been
   * answered, or at once when a later message took over the answering.
   */
  push(key: string, part: PendingPart): Promise<void>;
}

/**
 * One queue per conversation (`key`). Every message sleeps its own wait; the
 * one that wakes with nothing newer behind it answers for all that are
 * waiting, and the ones that wake to find a newer message simply leave.
 * Turns of the same conversation never overlap: a message that lands while
 * an answer is being written waits for it and is answered next, on its own.
 */
export function createSettler(opts: {
  run: (key: string, parts: PendingPart[]) => Promise<void>;
  wait?: (ms: number) => Promise<void>;
  now?: () => number;
}): Settler {
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? Date.now;
  const waiting = new Map<string, Waiting>();
  const locks = new Map<string, Promise<void>>();

  const locked = async (key: string, fn: () => Promise<void>): Promise<void> => {
    const before = locks.get(key) ?? Promise.resolve();
    const mine = before.catch(() => {}).then(fn);
    const tail = mine.catch(() => {});
    locks.set(key, tail);
    try {
      await mine;
    } finally {
      if (locks.get(key) === tail) locks.delete(key);
    }
  };

  return {
    async push(key, part) {
      const entry = waiting.get(key) ?? { parts: [], since: now() };
      entry.parts.push(part);
      waiting.set(key, entry);

      // Someone who keeps typing does not hold the answer off forever.
      const left = Math.max(0, SETTLE_MAX_MS - (now() - entry.since));
      const ms = Math.min(settleMs(part), left);
      if (ms > 0) await wait(ms);

      await locked(key, async () => {
        const current = waiting.get(key);
        // Answered already, inside a batch that a later message closed.
        if (!current || !current.parts.some((p) => p.id === part.id)) return;
        // A later message is still waiting its turn: it answers for both.
        const newest = current.parts[current.parts.length - 1];
        const overdue = now() - current.since >= SETTLE_MAX_MS;
        if (newest.id !== part.id && !overdue) return;
        waiting.delete(key);
        await opts.run(key, current.parts);
      });
    },
  };
}
