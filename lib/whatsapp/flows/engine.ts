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
import { normalizeText, parseCount, parseSpanishDate, parseSpanishTime, parseYesNo } from '../parse';
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
  /**
   * Free-text parser (Spanish dates and times live in parse.ts). `strict`
   * asks for only what the text says outright; see `stepGraphUnits`.
   */
  parse?: (slot: FlowSlot, text: string, strict?: boolean) => string | number | null;
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

/**
 * The answer in `raw`, as the slot's kind of value.
 *
 * `strict` is for reading a message for a question it was NOT asked: only a
 * value the text states outright counts ("a las 8", "4 personas", an option
 * by its name), never a bare number that could be anything.
 */
function coerce(slot: FlowSlot, raw: string, ctx: GraphEngineCtx, strict = false): string | number | null {
  if (slot.type === 'number') {
    const n = parseCount(raw, { strict });
    if (n === null) return null;
    if (slot.min != null && n < slot.min) return null;
    if (slot.max != null && n > slot.max) return null;
    return n;
  }
  if (slot.type === 'date' || slot.type === 'time') {
    return ctx.parse?.(slot, raw, strict) ?? null;
  }
  if (slot.type === 'phone') {
    if (strict && !/^[\s+()\d.-]+$/.test(raw.trim())) return null;
    const digits = digitsOnly(raw);
    return digits.length >= (strict ? 10 : 8) && digits.length <= 15 ? digits : null;
  }
  if (slot.type === 'email') {
    const m = strict ? raw.match(/[^\s@<>]+@[^\s@<>]+\.[^\s@<>.,;]+/) : raw.trim().match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    return m ? m[0].toLowerCase() : null;
  }
  if (slot.type === 'choice') {
    const opts = ctx.dynamicOptions?.[slot.key] ?? slot.options;
    return (strict ? optionNamed(opts, raw) : optionByAnswer(opts, raw))?.id ?? null;
  }
  // Free text is whatever was said — and so is never read out of a message
  // that was answering something else.
  return strict ? null : raw.trim() || null;
}

/** The one option a sentence names in full ("en la terraza, por favor"). */
function optionNamed<T extends { id: string; title: string }>(opts: T[] | undefined, raw: string): T | null {
  if (!opts?.length) return null;
  const byId = opts.find((o) => o.id === raw.trim());
  if (byId) return byId;
  const plain = ` ${normalizeText(raw).replace(/[^a-z0-9]+/g, ' ').trim()} `;
  const named = opts.filter((o) => {
    const title = normalizeText(o.title).replace(/[^a-z0-9]+/g, ' ').trim();
    return title.length >= 4 && plain.includes(` ${title} `);
  });
  return named.length === 1 ? named[0] : null;
}

/**
 * Which option a diner meant. A tapped row sends its id; a typed answer may
 * be the title, the title without accents, or — on a linked device, where
 * options go out as "1. Chico / 2. Grande" — just the number.
 */
export function optionByAnswer<T extends { id: string; title: string }>(opts: T[] | undefined, raw: string): T | null {
  if (!opts?.length) return null;
  const trimmed = raw.trim();
  const byId = opts.find((o) => o.id === trimmed);
  if (byId) return byId;
  const num = trimmed.match(/^(\d{1,2})[.)]?$/);
  if (num) return opts[Number(num[1]) - 1] ?? null;
  const plain = normalizeText(trimmed);
  if (!plain) return null;
  return (
    opts.find((o) => normalizeText(o.title) === plain) ??
    // "grande" for "Grande 20oz", "chico 16" for "Chico 16oz".
    opts.find((o) => normalizeText(o.title).startsWith(plain)) ??
    null
  );
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
  /** Read the answer strictly (see `coerce`); only `stepGraphUnits` asks for it. */
  strict = false,
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
    const value = input ? coerce(slot, input, ctx, strict) : null;
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
    // "1" / "2" answer the numbered buttons a linked device sends as text.
    const plain = normalizeText(input);
    const said = parseYesNo(input);
    const yes = input === GRAPH_YES || /^1[.)]?$/.test(plain) || said === 'yes';
    const no = input === GRAPH_NO || /^2[.)]?$/.test(plain) || said === 'no';
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
  return (slot, raw, strict = false) =>
    slot.type === 'date' ? parseSpanishDate(raw, today, { strict })
    : slot.type === 'time' ? parseSpanishTime(raw, { strict })
    : slot.type === 'number' ? parseCount(raw, { strict })
    : null;
}

/* ------------------------------------------------------- several answers */

/**
 * What a diner sent since the bot last spoke, cut into the pieces they would
 * call answers: one per message, and one per line of a message written as a
 * list. A tapped button is one piece, whatever its title says.
 */
export function unitsOf(turn: GraphTurn & { parts?: GraphTurn[] }): GraphTurn[] {
  const parts = turn.parts?.length ? turn.parts : [{ text: turn.text, replyId: turn.replyId }];
  const units: GraphTurn[] = [];
  for (const part of parts) {
    if (part.replyId) {
      units.push({ text: part.text, replyId: part.replyId });
      continue;
    }
    for (const line of (part.text ?? '').split(/\n+/)) {
      const text = line.replace(/^\s*(?:[-•*·]|\d{1,2}[.)])\s+/, '').trim();
      if (text) units.push({ text });
    }
  }
  return units.length ? units : [{ text: (turn.text ?? '').trim(), replyId: turn.replyId }];
}

/** A value the restaurant cannot take (a closed day): what to tell the diner. */
export type CaptureCheck = (capture: GraphCapture, answers: GraphRunState['answers']) => Promise<string | null>;

/**
 * Advance the run by everything the diner sent, which may be more than the
 * one answer the script was waiting for: three messages in a row, a list
 * with a line per detail, or one sentence that says it all ("somos 4, mañana
 * a las 8").
 *
 * The question they were asked takes what they sent in reply to it. After
 * that the run only skips a question when the diner has ALREADY answered it
 * in so many words: a question nobody has seen is never answered by a bare
 * number, free text is never guessed, and a summary is never confirmed
 * before it has been read to them. Whatever stays unclear is simply the
 * next thing asked.
 */
export async function stepGraphUnits(
  graph: FlowGraph,
  state: GraphRunState,
  units: GraphTurn[],
  ctx: GraphEngineCtx = {},
  check?: CaptureCheck,
): Promise<GraphStep> {
  const all = units.length ? units : [{ text: '' }];
  const joined = (list: GraphTurn[], glue = ' '): GraphTurn =>
    list.length === 1 ? list[0] : { text: list.map((u) => u.text).filter(Boolean).join(glue) };

  const asked = nodeById(graph, state.currentNodeId);
  let step: GraphStep;
  // How many pieces the asked question took.
  let taken = 0;

  if (asked?.type === 'question' && asked.data.slot.type !== 'text') {
    // The fewest pieces that make an answer: "13" alone, or "somos" + "13".
    step = stepGraph(graph, state, all[0], ctx);
    for (taken = 1; step.captured.length === 0 && taken < all.length;) {
      taken += 1;
      step = stepGraph(graph, state, joined(all.slice(0, taken)), ctx);
    }
  } else {
    // A name, a note, a yes — or the message that starts the flow: all of
    // it is the one answer.
    step = stepGraph(graph, state, joined(all, asked?.type === 'question' ? ' ' : '\n'), ctx);
  }

  const refusal = async (at: GraphRunState, captures: GraphCapture[], answers: GraphRunState['answers']): Promise<GraphStep | null> => {
    if (!check) return null;
    for (const capture of captures) {
      const why = await check(capture, answers);
      if (!why) continue;
      // Said why, and the same question asked again; the run stays put.
      const again = promptDraft(graph, at.currentNodeId, at.answers, ctx);
      return { state: at, replies: [{ type: 'text', body: why }, ...(again ? [again] : [])], actions: [], captured: [] };
    }
    return null;
  };

  const refusedFirst = await refusal(state, step.captured, step.state.answers);
  if (refusedFirst) return refusedFirst;

  const carried: OutboundDraft[] = [];
  const captured: GraphCapture[] = [...step.captured];
  // A piece answers a kind of question once: two number questions are not
  // both answered by the same "4 personas".
  const used = new Set<string>();
  if (asked?.type === 'question' && step.captured.length > 0) {
    for (let i = 0; i < taken; i++) used.add(`${i}:${asked.data.slot.type}`);
  }

  for (let hops = 0; hops < MAX_HOPS; hops++) {
    // Over, or with something to run, or still on the question they were
    // asked: nothing further is read into what they sent.
    if (step.outcome || step.actions.length > 0 || (asked && step.captured.length === 0)) break;
    const node = nodeById(graph, step.state.currentNodeId);
    if (!node || node.type !== 'question' || node.data.slot.type === 'text') break;
    const slot = node.data.slot;
    const at = all.findIndex((u, i) => !used.has(`${i}:${slot.type}`) && !u.replyId && coerce(slot, u.text, ctx, true) !== null);
    if (at < 0) break;
    used.add(`${at}:${slot.type}`);

    const next = stepGraph(graph, step.state, all[at], ctx, true);
    if (next.captured.length === 0) break;
    const refused = await refusal(step.state, next.captured, next.state.answers);
    if (refused) {
      return { ...refused, replies: [...carried, ...step.replies.slice(0, -1), ...refused.replies], captured };
    }
    // The question this piece answered was never sent: only what came before
    // it (a message node's text) is kept.
    carried.push(...step.replies.slice(0, -1));
    captured.push(...next.captured);
    step = next;
  }

  return { ...step, replies: [...carried, ...step.replies], captured };
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
/** Whether walking this flow books a table — the flows that day availability applies to. */
export function flowBooks(graph: FlowGraph): boolean {
  return graph.nodes.some((n) => n.type === 'action' && n.data.kind === 'create_reservation');
}

/** The slot a question node captures, by key. */
export function slotByKey(graph: FlowGraph, key: string): FlowSlot | null {
  for (const node of graph.nodes) {
    if (node.type === 'question' && node.data.slot.key === key) return node.data.slot;
  }
  return null;
}

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
