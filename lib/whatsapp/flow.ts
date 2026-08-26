/**
 * A small slot-filling machine: the deterministic half of the bot.
 *
 * Deliberately PURE — no database, no network, no clock of its own. Everything
 * it needs arrives in `ctx`, which means the whole booking conversation can be
 * unit-tested without a Meta account, and the AI layer can reuse it as a
 * fallback without dragging infrastructure along.
 *
 * The design decision that makes AI-off mode good rather than merely tolerable:
 * ask with BUTTONS AND LISTS wherever possible. Reply ids come back verbatim,
 * so most turns need no Spanish parsing at all.
 */

import { normalizeText } from './parse';
import type { OutboundDraft } from './types';

export interface Slot {
  key: string;
  type: 'text' | 'number' | 'date' | 'time' | 'choice';
  prompt: string;
  required?: boolean;
  min?: number;
  max?: number;
  /** Rendered as buttons (≤3) or a list (>3). */
  options?: { id: string; title: string; description?: string }[];
}

export interface FlowDef {
  slots: Slot[];
  confirm?: { body: string };
  onConfirm?: 'create_reservation' | 'notify_staff' | 'none';
  onCancel?: string;
}

export interface FlowState {
  /** Slot key currently being asked. */
  asking?: string;
  values: Record<string, string | number>;
  /** True once the summary has been sent and we're waiting for yes/no. */
  confirming?: boolean;
}

export interface FlowContext {
  /** Choices offered for a slot whose options are computed, e.g. open days. */
  dynamicOptions?: Record<string, { id: string; title: string; description?: string }[]>;
  /** Parses free text for a slot when the diner types instead of tapping. */
  parse?: (slot: Slot, text: string) => string | number | null;
}

export interface FlowTurn {
  /** Raw text the diner sent. */
  text: string;
  /** Id of a tapped button/list row, if any. Always preferred over `text`. */
  replyId?: string | null;
}

export interface ActionRequest {
  kind: 'create_reservation' | 'notify_staff';
  values: Record<string, string | number>;
}

export interface FlowStep {
  state: FlowState;
  replies: OutboundDraft[];
  action?: ActionRequest;
  /** True when the flow has nothing left to do. */
  done?: boolean;
}

export const CONFIRM_YES = 'flow_yes';
export const CONFIRM_NO = 'flow_no';

function render(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(values[k] ?? ''));
}

/** Turn a slot's options into buttons (≤3) or a list, per WhatsApp's limits. */
function ask(slot: Slot, options?: Slot['options']): OutboundDraft {
  const opts = options ?? slot.options;
  if (!opts || opts.length === 0) return { type: 'text', body: slot.prompt };
  if (opts.length <= 3) {
    return { type: 'interactive', body: slot.prompt, buttons: opts.map(({ id, title }) => ({ id, title })) };
  }
  return {
    type: 'interactive',
    body: slot.prompt,
    list: { button: 'Ver opciones', sections: [{ rows: opts.slice(0, 10) }] },
  };
}

function coerce(slot: Slot, raw: string, ctx: FlowContext): string | number | null {
  if (slot.type === 'number') {
    const digits = raw.match(/\d+/);
    const n = digits ? Number(digits[0]) : NaN;
    if (Number.isNaN(n)) return ctx.parse?.(slot, raw) ?? null;
    if (slot.min != null && n < slot.min) return null;
    if (slot.max != null && n > slot.max) return null;
    return n;
  }
  if (slot.type === 'date' || slot.type === 'time') {
    return ctx.parse?.(slot, raw) ?? null;
  }
  if (slot.type === 'choice') {
    const match = slot.options?.find(
      (o) => o.id === raw || o.title.toLowerCase() === raw.trim().toLowerCase(),
    );
    return match?.id ?? null;
  }
  return raw.trim() || null;
}

function nextUnfilled(def: FlowDef, values: FlowState['values']): Slot | undefined {
  return def.slots.find((s) => s.required !== false && values[s.key] === undefined);
}

/**
 * Advance the conversation by one turn.
 *
 * Called with the diner's message and the state we stored last time; returns
 * the new state plus whatever should be said back.
 */
export function step(
  def: FlowDef,
  state: FlowState,
  turn: FlowTurn,
  ctx: FlowContext = {},
): FlowStep {
  const values = { ...state.values };
  const input = (turn.replyId ?? turn.text ?? '').trim();

  // Waiting on the summary: only yes or no matters here.
  if (state.confirming) {
    // Accents have to come off BEFORE matching. JavaScript's \b is ASCII-only,
    // so in "sí, correcto" there is no word boundary after the í and a pattern
    // like /^s[ií]\b/ silently fails — on the single most common way to say yes
    // in Spanish.
    const plain = normalizeText(input);
    const yes = input === CONFIRM_YES || /^(si|yes|correcto|confirmo|confirmar|ok|dale|va|claro)\b/.test(plain);
    const no = input === CONFIRM_NO || /^(no|cancela|cancelar|mejor no)\b/.test(plain);

    if (yes) {
      return {
        state: { values, confirming: false },
        replies: [],
        action: def.onConfirm && def.onConfirm !== 'none'
          ? { kind: def.onConfirm, values }
          : undefined,
        done: true,
      };
    }
    if (no) {
      return {
        state: { values: {}, confirming: false },
        replies: def.onCancel ? [{ type: 'text', body: def.onCancel }] : [],
        done: true,
      };
    }
    // Neither: re-ask rather than guessing.
    return {
      state,
      replies: [{
        type: 'interactive',
        body: render(def.confirm?.body ?? '', values),
        buttons: [
          { id: CONFIRM_YES, title: 'Sí, confirmar' },
          { id: CONFIRM_NO, title: 'No' },
        ],
      }],
    };
  }

  // Record the answer to whatever we last asked.
  if (state.asking) {
    const slot = def.slots.find((s) => s.key === state.asking);
    if (slot && input) {
      const value = coerce(slot, input, ctx);
      if (value === null) {
        // Unparseable — ask again with the same affordances rather than
        // advancing on a guess.
        return {
          state,
          replies: [ask(slot, ctx.dynamicOptions?.[slot.key])],
        };
      }
      values[slot.key] = value;
    }
  }

  const next = nextUnfilled(def, values);
  if (next) {
    return {
      state: { asking: next.key, values },
      replies: [ask(next, ctx.dynamicOptions?.[next.key])],
    };
  }

  // Everything collected: read it back before committing.
  if (def.confirm) {
    return {
      state: { values, confirming: true },
      replies: [{
        type: 'interactive',
        body: render(def.confirm.body, values),
        buttons: [
          { id: CONFIRM_YES, title: 'Sí, confirmar' },
          { id: CONFIRM_NO, title: 'No' },
        ],
      }],
    };
  }

  return {
    state: { values },
    replies: [],
    action: def.onConfirm && def.onConfirm !== 'none' ? { kind: def.onConfirm, values } : undefined,
    done: true,
  };
}
