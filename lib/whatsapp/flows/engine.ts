/**
 * Graph walker: the deterministic half of a flow run.
 *
 * Deliberately PURE, like flow.ts before it — no database, no network, no
 * clock. The caller (runtime.ts) supplies parsing and vars through `ctx` and
 * persists whatever comes back, so a whole conversation is unit-testable
 * without a WhatsApp account.
 *
 * The walking rule: coerce the diner's answer at the node we were waiting on,
 * then traverse message/branch/action nodes — accumulating replies and action
 * requests — until the run rests at the next question/confirm or reaches an
 * end. `validateGraph` promises there is no cycle made purely of traversal
 * nodes; MAX_HOPS is the seatbelt for graphs that dodged validation.
 */

import { digitsOnly } from '@/lib/utils';
import { normalizeText, parsePartySize, parseSpanishDate, parseSpanishTime } from '../parse';
import { renderTemplate } from '../render';
import type { OutboundDraft } from '../types';
import {
  HANDLE_ELSE, HANDLE_NO, HANDLE_YES,
  type BranchCondition, type FlowActionKind, type FlowGraph, type FlowNode,
  type FlowSlot, type QuestionNode, type SlotOption,
} from './schema';

export const GRAPH_YES = 'flow_yes';
export const GRAPH_NO = 'flow_no';

const MAX_HOPS = 30;

export interface GraphRunState {
  /** Node the run is waiting at (question/confirm). Null = not started. */
  currentNodeId: string | null;
  answers: Record<string, string | number>;
}

export interface GraphTurn {
  text: string;
  /** Tapped button/list row id. Always preferred over `text`. */
  replyId?: string | null;
}

export interface GraphEngineCtx {
  /** Facts prompts can interpolate ({{restaurante}}, {{menu_url}}, …). */
  vars?: Record<string, string | undefined>;
  /** Options computed at runtime for a slot, e.g. open days. */
  dynamicOptions?: Record<string, SlotOption[]>;
  /** Free-text parser (Spanish dates/times/party size live in parse.ts). */
  parse?: (slot: FlowSlot, text: string) => string | number | null;
}

export interface GraphActionRequest {
  kind: FlowActionKind;
  nodeId: string;
  /** All answers, plus any argsFromSlots remappings. */
  args: Record<string, string | number>;
}

export interface GraphCapture {
  key: string;
  value: string | number;
  source: 'button' | 'text';
}

export interface GraphStep {
  state: GraphRunState;
  replies: OutboundDraft[];
  actions: GraphActionRequest[];
  /** Set when the run reached an end node (or was canceled at a confirm). */
  outcome?: 'completed' | 'canceled';
  /**
   * The end node's own message, kept apart from `replies` so the caller can
   * slot action outcomes ("tu solicitud quedó registrada") before it.
   */
  endBody?: OutboundDraft;
  /** Answers recorded THIS turn — the runtime stamps them with time/source. */
  captured: GraphCapture[];
}

/* ---------------------------------------------------------------- helpers */

function nodeById(graph: FlowGraph, id: string | null | undefined): FlowNode | undefined {
  return id ? graph.nodes.find((n) => n.id === id) : undefined;
}

/** Follow an exit: exact handle first, then the handle-less default edge. */
function targetOf(graph: FlowGraph, nodeId: string, handle?: string): string | null {
  const out = graph.edges.filter((e) => e.source === nodeId);
  if (handle !== undefined) {
    const exact = out.find((e) => e.sourceHandle === handle);
    if (exact) return exact.target;
  }
  const fallback = out.find((e) => e.sourceHandle == null);
  return fallback?.target ?? null;
}

/**
 * Shared traversal steps — every walker (stepGraph, completeGraph,
 * resumeNodeId) routes branches and builds action args through these, so a
 * semantics fix can't land in one walker and drift from the others.
 */
function branchTarget(
  graph: FlowGraph,
  node: Extract<FlowNode, { type: 'branch' }>,
  answers: GraphRunState['answers'],
): string | null {
  const hit = node.data.conditions.find((c) => evalCondition(c, answers));
  return targetOf(graph, node.id, hit ? hit.id : HANDLE_ELSE);
}

function questionTarget(
  graph: FlowGraph,
  node: QuestionNode,
  answers: GraphRunState['answers'],
): string | null {
  return targetOf(
    graph, node.id,
    node.data.slot.type === 'choice' && answers[node.data.slot.key] !== undefined
      ? String(answers[node.data.slot.key])
      : undefined,
  );
}

function actionRequest(
  node: Extract<FlowNode, { type: 'action' }>,
  answers: GraphRunState['answers'],
): GraphActionRequest {
  const args: Record<string, string | number> = { ...answers };
  for (const [arg, slotKey] of Object.entries(node.data.argsFromSlots ?? {})) {
    if (answers[slotKey] !== undefined) args[arg] = answers[slotKey];
  }
  return { kind: node.data.kind, nodeId: node.id, args };
}

function render(template: string, ctx: GraphEngineCtx, answers: GraphRunState['answers']): string {
  const merged: Record<string, string | undefined> = { ...ctx.vars };
  for (const [k, v] of Object.entries(answers)) merged[k] = String(v);
  return renderTemplate(template, merged);
}

/** Buttons (≤3) or a list (≤10), per WhatsApp's limits — same rule as flow.ts. */
function ask(node: QuestionNode, ctx: GraphEngineCtx, answers: GraphRunState['answers'], retry = false): OutboundDraft {
  const body = render(retry ? node.data.retryPrompt ?? node.data.prompt : node.data.prompt, ctx, answers);
  const opts = ctx.dynamicOptions?.[node.data.slot.key] ?? node.data.slot.options;
  if (!opts || opts.length === 0) return { type: 'text', body };
  if (opts.length <= 3) {
    return { type: 'interactive', body, buttons: opts.map(({ id, title }) => ({ id, title })) };
  }
  return {
    type: 'interactive',
    body,
    list: { button: 'Ver opciones', sections: [{ rows: opts.slice(0, 10) }] },
  };
}

function confirmDraft(body: string): OutboundDraft {
  return {
    type: 'interactive',
    body,
    buttons: [
      { id: GRAPH_YES, title: 'Sí, confirmar' },
      { id: GRAPH_NO, title: 'No' },
    ],
  };
}

function coerce(slot: FlowSlot, raw: string, ctx: GraphEngineCtx): string | number | null {
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
  if (slot.type === 'phone') {
    const digits = digitsOnly(raw);
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  if (slot.type === 'email') {
    const m = raw.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    return m ? m[0].toLowerCase() : null;
  }
  if (slot.type === 'choice') {
    const opts = ctx.dynamicOptions?.[slot.key] ?? slot.options;
    const match = opts?.find(
      (o) => o.id === raw || o.title.toLowerCase() === raw.trim().toLowerCase(),
    );
    return match?.id ?? null;
  }
  return raw.trim() || null;
}

function evalCondition(cond: BranchCondition, answers: GraphRunState['answers']): boolean {
  const answer = answers[cond.slot];
  switch (cond.op) {
    case 'answered': return answer !== undefined;
    case 'not_answered': return answer === undefined;
    default: break;
  }
  if (answer === undefined) return false;
  const want = cond.value;
  switch (cond.op) {
    case 'eq': return String(answer) === String(want);
    case 'neq': return String(answer) !== String(want);
    case 'contains': return normalizeText(String(answer)).includes(normalizeText(String(want ?? '')));
    case 'gt': return Number(answer) > Number(want);
    case 'gte': return Number(answer) >= Number(want);
    case 'lt': return Number(answer) < Number(want);
    case 'lte': return Number(answer) <= Number(want);
    default: return false;
  }
}

/* ------------------------------------------------------------------- step */

/**
 * Advance the run by one diner turn.
 *
 * Returns the new state plus everything to say and do. `outcome` set means
 * the run is over; the runtime records it and clears the conversation's
 * active run pointer.
 */
export function stepGraph(
  graph: FlowGraph,
  state: GraphRunState,
  turn: GraphTurn,
  ctx: GraphEngineCtx = {},
): GraphStep {
  const answers = { ...state.answers };
  const replies: OutboundDraft[] = [];
  const actions: GraphActionRequest[] = [];
  const captured: GraphCapture[] = [];
  const input = (turn.replyId ?? turn.text ?? '').trim();

  const current = nodeById(graph, state.currentNodeId);
  let next: string | null;

  if (!current) {
    // First turn: the message that triggered the flow answers nothing —
    // it just starts the walk from the start node.
    const start = graph.nodes.find((n) => n.type === 'start');
    if (!start) return { state, replies, actions, captured, outcome: 'completed' };
    next = targetOf(graph, start.id);
  } else if (current.type === 'question') {
    const slot = current.data.slot;
    const value = input ? coerce(slot, input, ctx) : null;
    if (value === null) {
      // Unparseable — re-ask with the same affordances rather than advancing
      // on a guess.
      return { state, replies: [ask(current, ctx, answers, true)], actions, captured };
    }
    answers[slot.key] = value;
    captured.push({ key: slot.key, value, source: turn.replyId ? 'button' : 'text' });
    // A tapped option can leave through its own edge; everything else takes
    // the default exit.
    next = questionTarget(graph, current, answers);
  } else if (current.type === 'confirm') {
    // Accents come off BEFORE matching: JS \b is ASCII-only, and "sí" has no
    // word boundary after the í — the single most common yes in Spanish.
    const plain = normalizeText(input);
    const yes = input === GRAPH_YES || /^(si|yes|correcto|confirmo|confirmar|ok|dale|va|claro)\b/.test(plain);
    const no = input === GRAPH_NO || /^(no|cancela|cancelar|mejor no)\b/.test(plain);
    if (yes) {
      next = targetOf(graph, current.id, HANDLE_YES);
    } else if (no) {
      next = targetOf(graph, current.id, HANDLE_NO);
      if (next === null) {
        // No "no" branch drawn: the flow simply ends, unbooked.
        return { state: { currentNodeId: null, answers }, replies, actions, captured, outcome: 'canceled' };
      }
    } else {
      // Neither: re-ask rather than guessing.
      return { state, replies: [confirmDraft(render(current.data.body, ctx, answers))], actions, captured };
    }
  } else {
    // State points at a traversal node (shouldn't happen) — resume from it.
    next = current.id;
  }

  // Walk until the run rests or ends.
  for (let hops = 0; hops < MAX_HOPS; hops++) {
    const node = nodeById(graph, next);
    if (!node) {
      // Dangling edge or missing default exit: close gracefully rather than
      // stranding the diner in a dead run.
      return { state: { currentNodeId: null, answers }, replies, actions, captured, outcome: 'completed' };
    }
    switch (node.type) {
      case 'start':
        next = targetOf(graph, node.id);
        continue;
      case 'message':
        replies.push({ type: 'text', body: render(node.data.body, ctx, answers) });
        next = targetOf(graph, node.id);
        continue;
      case 'branch':
        next = branchTarget(graph, node, answers);
        continue;
      case 'action':
        actions.push(actionRequest(node, answers));
        next = targetOf(graph, node.id);
        continue;
      case 'question':
        return { state: { currentNodeId: node.id, answers }, replies: [...replies, ask(node, ctx, answers)], actions, captured };
      case 'confirm':
        return {
          state: { currentNodeId: node.id, answers },
          replies: [...replies, confirmDraft(render(node.data.body, ctx, answers))],
          actions,
          captured,
        };
      case 'end': {
        return {
          state: { currentNodeId: null, answers },
          replies,
          actions,
          captured,
          outcome: node.data.outcome ?? 'completed',
          ...(node.data.body
            ? { endBody: { type: 'text' as const, body: render(node.data.body, ctx, answers) } }
            : {}),
        };
      }
    }
  }

  // MAX_HOPS exceeded: a loop validateGraph should have caught. End the run.
  return { state: { currentNodeId: null, answers }, replies, actions, captured, outcome: 'completed' };
}

/**
 * The Spanish free-text parser every runner of a flow shares — the live
 * runtime and the canvas simulator import THIS, so what the owner rehearses
 * is what a diner gets. Works on the slot's TYPE, never on a magic slot key:
 * a custom flow's "personas" number slot still understands "somos cuatro".
 * (Digits are handled by coerce() first; this only sees what digits missed.)
 */
export function spanishSlotParser(today: string): NonNullable<GraphEngineCtx['parse']> {
  return (slot, raw) =>
    slot.type === 'date' ? parseSpanishDate(raw, today)
    : slot.type === 'time' ? parseSpanishTime(raw)
    : slot.type === 'number' ? parsePartySize(raw)
    : null;
}

/**
 * The message that re-asks whatever the run is waiting on — the nudge. Same
 * affordances as the original ask, so a tapped button still works.
 */
export function promptDraft(
  graph: FlowGraph,
  nodeId: string | null,
  answers: GraphRunState['answers'],
  ctx: GraphEngineCtx = {},
  prefix?: string | null,
): OutboundDraft | null {
  const node = nodeById(graph, nodeId);
  if (!node) return null;
  let draft: OutboundDraft;
  if (node.type === 'question') draft = ask(node, ctx, answers);
  else if (node.type === 'confirm') draft = confirmDraft(render(node.data.body, ctx, answers));
  else return null;
  return prefix ? { ...draft, body: `${render(prefix, ctx, answers)}\n${draft.body}` } : draft;
}

/**
 * Finish a run whose slots the AI already filled: walk from start, skipping
 * answered questions, auto-confirming summaries, collecting actions and the
 * end message. This is `finalizar_flujo`'s executor — the AI's exit runs the
 * SAME action nodes the linear walk would, so neither path can drift.
 */
export function completeGraph(
  graph: FlowGraph,
  answers: GraphRunState['answers'],
  ctx: GraphEngineCtx = {},
): { replies: OutboundDraft[]; actions: GraphActionRequest[]; outcome: 'completed' | 'canceled' } {
  const replies: OutboundDraft[] = [];
  const actions: GraphActionRequest[] = [];
  const start = graph.nodes.find((n) => n.type === 'start');
  let next = start ? targetOf(graph, start.id) : null;

  for (let hops = 0; hops < MAX_HOPS; hops++) {
    const node = nodeById(graph, next);
    if (!node) return { replies, actions, outcome: 'completed' };
    switch (node.type) {
      case 'question':
        next = questionTarget(graph, node, answers);
        continue;
      case 'confirm':
        // The AI already read the summary back and got a yes.
        next = targetOf(graph, node.id, HANDLE_YES);
        continue;
      case 'branch':
        next = branchTarget(graph, node, answers);
        continue;
      case 'action':
        actions.push(actionRequest(node, answers));
        next = targetOf(graph, node.id);
        continue;
      case 'end':
        if (node.data.body) replies.push({ type: 'text', body: render(node.data.body, ctx, answers) });
        return { replies, actions, outcome: node.data.outcome ?? 'completed' };
      default:
        next = targetOf(graph, node.id);
        continue;
    }
  }
  return { replies, actions, outcome: 'completed' };
}

/**
 * Where a run should resume when the AI hands back mid-flow: the first
 * waiting node (BFS from start) whose slot has no answer yet, resolving
 * branches that are already decidable along the way.
 */
export function resumeNodeId(graph: FlowGraph, answers: GraphRunState['answers']): string | null {
  const start = graph.nodes.find((n) => n.type === 'start');
  if (!start) return null;
  let next = targetOf(graph, start.id);
  for (let hops = 0; hops < MAX_HOPS; hops++) {
    const node = nodeById(graph, next);
    if (!node) return null;
    switch (node.type) {
      case 'question':
        if (answers[node.data.slot.key] === undefined) return node.id;
        next = questionTarget(graph, node, answers);
        continue;
      case 'confirm':
        return node.id;
      case 'branch':
        next = branchTarget(graph, node, answers);
        continue;
      case 'message':
      case 'action':
      case 'start':
        next = targetOf(graph, node.id);
        continue;
      case 'end':
        return null;
    }
  }
  return null;
}
