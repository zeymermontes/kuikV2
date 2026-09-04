import { normalizeText } from './parse';

/**
 * Which goal is this message about, without asking a model.
 *
 * Keyword scoring plus a numbered menu. The menu is the important half: it is
 * what makes AI-off mode a complete product rather than a degraded one, because
 * a diner who taps "1" needs no language understanding at all.
 */

export interface Trigger {
  kind: 'keyword' | 'regex' | 'interactive_id';
  value: string;
}

export interface MatchableGoal {
  id: string;
  key: string;
  name: string;
  enabled: boolean;
  priority: number;
  triggers: Trigger[];
}

export interface IntentMatch {
  goal: MatchableGoal;
  score: number;
}

/**
 * A tapped button always wins: its id is exact, so there is nothing to infer.
 * Otherwise score keywords, weighted by the goal's configured priority.
 */
export function matchGoal(
  goals: MatchableGoal[],
  text: string,
  replyId?: string | null,
): IntentMatch | null {
  const enabled = goals.filter((g) => g.enabled);

  if (replyId) {
    const byId = enabled.find((g) =>
      g.triggers.some((t) => t.kind === 'interactive_id' && t.value === replyId),
    );
    if (byId) return { goal: byId, score: 100 };

    // The numbered menu sends goal:<key>.
    const prefixed = replyId.startsWith('goal:') ? replyId.slice(5) : null;
    const byKey = prefixed ? enabled.find((g) => g.key === prefixed) : null;
    if (byKey) return { goal: byKey, score: 100 };
  }

  const s = normalizeText(text);
  if (!s) return null;

  // "1", "2"… from someone who typed the menu number instead of tapping.
  const bare = s.match(/^([1-9])$/);
  if (bare) {
    const index = Number(bare[1]) - 1;
    const ordered = [...enabled].sort((a, b) => b.priority - a.priority);
    if (ordered[index]) return { goal: ordered[index], score: 100 };
  }

  let best: IntentMatch | null = null;
  for (const goal of enabled) {
    let score = 0;
    for (const trigger of goal.triggers) {
      if (trigger.kind === 'keyword') {
        const k = normalizeText(trigger.value);
        // Word-boundary so "menu" doesn't fire on "menudo".
        if (k && new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s)) score += 2;
      } else if (trigger.kind === 'regex') {
        try {
          if (new RegExp(trigger.value, 'i').test(s)) score += 3;
        } catch {
          // A tenant typed a bad pattern; ignore it rather than blowing up.
        }
      }
    }
    if (score === 0) continue;
    score += goal.priority * 0.1;
    if (!best || score > best.score) best = { goal, score };
  }

  // Below this, a wrong guess is worse than offering the menu.
  return best && best.score >= 2 ? best : null;
}

/**
 * Whether the message contains any of the keywords as a WHOLE WORD.
 *
 * Substring matching is what silently killed the bot mid-booking: the answer
 * "2 personas" to "¿para cuántas personas?" contains the handoff keyword
 * "persona", so the diner's second message handed the conversation to a human
 * and muted the bot. Word boundaries fix it — "\bpersona\b" does not match
 * "personas" — while "quiero hablar con una persona" still triggers.
 */
export function matchesAnyKeyword(keywords: string[], text: string): boolean {
  const s = normalizeText(text);
  if (!s) return false;
  return keywords.some((keyword) => {
    const k = normalizeText(keyword);
    if (!k) return false;
    return new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(s);
  });
}

/** The fallback that always works: "1 Reservar · 2 Horarios · …". */
export function buildMenu(goals: MatchableGoal[]): { id: string; title: string }[] {
  return [...goals]
    .filter((g) => g.enabled)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 10)
    .map((g) => ({ id: `goal:${g.key}`, title: g.name.slice(0, 24) }));
}
