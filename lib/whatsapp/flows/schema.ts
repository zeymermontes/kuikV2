/**
 * The flow graph contract — the single shape shared by the canvas editor,
 * the execution engine and the database.
 *
 * Deliberately client-safe (no `server-only`, no supabase): the React Flow
 * canvas serializes exactly this to `whatsapp_flows.draft_graph`, and the
 * engine executes it verbatim from `whatsapp_flow_versions.graph`. Anything
 * the two halves disagree on becomes a stuck diner, so the Zod schema here is
 * the arbiter: drafts only need the SHAPE to be right, publishing additionally
 * requires `validateGraph` to pass.
 *
 * Per-flow config that does not change the conversation's structure — mode,
 * triggers, nudge/close timers — lives in columns on `whatsapp_flows`, not in
 * the graph, so tweaking a timer never requires republishing.
 */

import { z } from 'zod';

/* ------------------------------------------------------------------ types */

export type SlotType = 'text' | 'number' | 'phone' | 'email' | 'date' | 'time' | 'choice';

export interface SlotOption {
  id: string;
  title: string;
  description?: string;
}

export interface FlowSlot {
  /** Unique across the graph; the key answers are stored under. */
  key: string;
  /** Human name shown in the inbox and given to the AI ("Número de personas"). */
  label: string;
  type: SlotType;
  /** Defaults to true. Optional slots don't block completion. */
  required?: boolean;
  min?: number;
  max?: number;
  /** For `choice`: rendered as buttons (≤3) or a list (≤10). */
  options?: SlotOption[];
}

export interface NodePosition {
  x: number;
  y: number;
}

interface BaseNode {
  id: string;
  position: NodePosition;
}

export interface StartNode extends BaseNode {
  type: 'start';
  data: Record<string, never>;
}

/** Says something and moves on without waiting for a reply. */
export interface MessageNode extends BaseNode {
  type: 'message';
  data: { body: string };
}

/** Asks and WAITS. The only node (besides confirm) where a run can rest. */
export interface QuestionNode extends BaseNode {
  type: 'question';
  data: {
    slot: FlowSlot;
    /** Supports {{vars}} and {{slot_key}} placeholders. */
    prompt: string;
    /** Sent instead of `prompt` when the answer didn't validate. */
    retryPrompt?: string;
  };
}

export type BranchOp =
  | 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'contains' | 'answered' | 'not_answered';

export interface BranchCondition {
  id: string;
  /** Slot key the condition reads. */
  slot: string;
  op: BranchOp;
  value?: string | number;
}

/**
 * Routes on already-captured answers. Conditions are evaluated in order;
 * edges leave via `sourceHandle = condition.id`, plus a mandatory `'else'`.
 */
export interface BranchNode extends BaseNode {
  type: 'branch';
  data: { conditions: BranchCondition[] };
}

/** Reads the summary back and waits; edges leave via 'yes' / 'no' handles. */
export interface ConfirmNode extends BaseNode {
  type: 'confirm';
  data: { body: string };
}

export type FlowActionKind =
  | 'create_reservation' | 'notify_staff' | 'send_menu_link' | 'handoff';

/** Does something in the real world, then moves on. */
export interface ActionNode extends BaseNode {
  type: 'action';
  data: {
    kind: FlowActionKind;
    /** Maps action argument names to slot keys, e.g. { party_size: 'personas' }. */
    argsFromSlots?: Record<string, string>;
  };
}

export interface EndNode extends BaseNode {
  type: 'end';
  data: {
    body?: string;
    /** How the run is recorded. Defaults to 'completed'. */
    outcome?: 'completed' | 'canceled';
  };
}

export type FlowNode =
  | StartNode | MessageNode | QuestionNode | BranchNode
  | ConfirmNode | ActionNode | EndNode;

export type FlowNodeType = FlowNode['type'];

export interface FlowEdge {
  id: string;
  source: string;
  /** Which exit of the source: option id, condition id, 'yes'/'no', 'else'. */
  sourceHandle?: string | null;
  target: string;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** Reserved sourceHandle values on confirm and branch nodes. */
export const HANDLE_YES = 'yes';
export const HANDLE_NO = 'no';
export const HANDLE_ELSE = 'else';

/** Nodes where a run waits for the diner. Everything else is traversed. */
export const WAITING_TYPES: readonly FlowNodeType[] = ['question', 'confirm'];

/* ------------------------------------------------------------- zod shapes */

const positionSchema = z.object({ x: z.number(), y: z.number() });

const optionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(24),
  description: z.string().max(72).optional(),
});

const slotSchema = z.object({
  key: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, 'snake_case'),
  label: z.string().min(1).max(80),
  type: z.enum(['text', 'number', 'phone', 'email', 'date', 'time', 'choice']),
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  options: z.array(optionSchema).max(10).optional(),
});

const conditionSchema = z.object({
  id: z.string().min(1),
  slot: z.string().min(1),
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'answered', 'not_answered']),
  value: z.union([z.string(), z.number()]).optional(),
});

const nodeSchema = z.discriminatedUnion('type', [
  z.object({ id: z.string().min(1), type: z.literal('start'), position: positionSchema, data: z.object({}) }),
  z.object({ id: z.string().min(1), type: z.literal('message'), position: positionSchema, data: z.object({ body: z.string().min(1).max(1024) }) }),
  z.object({
    id: z.string().min(1), type: z.literal('question'), position: positionSchema,
    data: z.object({
      slot: slotSchema,
      prompt: z.string().min(1).max(1024),
      retryPrompt: z.string().max(1024).optional(),
    }),
  }),
  z.object({
    id: z.string().min(1), type: z.literal('branch'), position: positionSchema,
    data: z.object({ conditions: z.array(conditionSchema).max(10) }),
  }),
  z.object({ id: z.string().min(1), type: z.literal('confirm'), position: positionSchema, data: z.object({ body: z.string().min(1).max(1024) }) }),
  z.object({
    id: z.string().min(1), type: z.literal('action'), position: positionSchema,
    data: z.object({
      kind: z.enum(['create_reservation', 'notify_staff', 'send_menu_link', 'handoff']),
      argsFromSlots: z.record(z.string(), z.string()).optional(),
    }),
  }),
  z.object({
    id: z.string().min(1), type: z.literal('end'), position: positionSchema,
    data: z.object({
      body: z.string().max(1024).optional(),
      outcome: z.enum(['completed', 'canceled']).optional(),
    }),
  }),
]);

const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  target: z.string().min(1),
});

/** Shape-only validation — what a DRAFT save requires. */
export const flowGraphSchema = z.object({
  nodes: z.array(nodeSchema).max(100),
  edges: z.array(edgeSchema).max(200),
});

/* ------------------------------------------------------------- validation */

export interface GraphIssue {
  code:
    | 'no_start' | 'multiple_start' | 'edge_bad_ref' | 'duplicate_slot'
    | 'no_outgoing' | 'missing_yes_edge' | 'missing_else_edge'
    | 'choice_needs_options' | 'unreachable' | 'no_end_reachable'
    | 'loop_without_wait' | 'branch_unknown_slot';
  nodeId?: string;
  edgeId?: string;
}

function outgoing(graph: FlowGraph, nodeId: string): FlowEdge[] {
  return graph.edges.filter((e) => e.source === nodeId);
}

/**
 * Structural soundness — what PUBLISHING requires.
 *
 * The rules exist so the engine can never strand a diner: every waiting node
 * has somewhere to go, every path can end, and no cycle exists that the
 * traversal loop could spin through without stopping to wait for a human.
 */
export function validateGraph(graph: FlowGraph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));

  const starts = graph.nodes.filter((n) => n.type === 'start');
  if (starts.length === 0) issues.push({ code: 'no_start' });
  if (starts.length > 1) starts.slice(1).forEach((n) => issues.push({ code: 'multiple_start', nodeId: n.id }));

  for (const edge of graph.edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) {
      issues.push({ code: 'edge_bad_ref', edgeId: edge.id });
    }
  }

  const slotKeys = new Set<string>();
  for (const node of graph.nodes) {
    if (node.type !== 'question') continue;
    const key = node.data.slot.key;
    if (slotKeys.has(key)) issues.push({ code: 'duplicate_slot', nodeId: node.id });
    slotKeys.add(key);
    if (node.data.slot.type === 'choice' && !node.data.slot.options?.length) {
      issues.push({ code: 'choice_needs_options', nodeId: node.id });
    }
  }

  for (const node of graph.nodes) {
    const out = outgoing(graph, node.id);
    switch (node.type) {
      case 'end':
        break;
      case 'confirm':
        if (!out.some((e) => e.sourceHandle === HANDLE_YES)) {
          issues.push({ code: 'missing_yes_edge', nodeId: node.id });
        }
        break;
      case 'branch': {
        if (!out.some((e) => e.sourceHandle === HANDLE_ELSE)) {
          issues.push({ code: 'missing_else_edge', nodeId: node.id });
        }
        for (const cond of node.data.conditions) {
          if (!slotKeys.has(cond.slot)) issues.push({ code: 'branch_unknown_slot', nodeId: node.id });
        }
        break;
      }
      default:
        if (out.length === 0) issues.push({ code: 'no_outgoing', nodeId: node.id });
    }
  }

  // Reachability from start.
  const start = starts[0];
  const reached = new Set<string>();
  if (start) {
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (reached.has(id)) continue;
      reached.add(id);
      for (const e of outgoing(graph, id)) if (byId.has(e.target)) queue.push(e.target);
    }
    for (const node of graph.nodes) {
      if (!reached.has(node.id)) issues.push({ code: 'unreachable', nodeId: node.id });
    }
    if (![...reached].some((id) => byId.get(id)?.type === 'end')) {
      issues.push({ code: 'no_end_reachable' });
    }
  }

  // A cycle made only of traversal nodes (no question/confirm to stop at)
  // would make the engine loop forever. DFS over the traversal-only subgraph.
  const traversal = new Set(
    graph.nodes.filter((n) => !WAITING_TYPES.includes(n.type)).map((n) => n.id),
  );
  const color = new Map<string, 1 | 2>(); // 1 = visiting, 2 = done
  const hasCycle = (id: string): boolean => {
    color.set(id, 1);
    for (const e of outgoing(graph, id)) {
      if (!traversal.has(e.target)) continue;
      const c = color.get(e.target);
      if (c === 1) return true;
      if (!c && hasCycle(e.target)) return true;
    }
    color.set(id, 2);
    return false;
  };
  for (const id of traversal) {
    if (!color.has(id) && hasCycle(id)) {
      issues.push({ code: 'loop_without_wait', nodeId: id });
      break;
    }
  }

  return issues;
}

/* --------------------------------------------------------------- helpers */

/**
 * Slots in the order a diner would meet them (BFS from start), with any
 * unreached questions appended — the contract for AI mode and the inbox.
 */
export function slotsOf(graph: FlowGraph): FlowSlot[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const start = graph.nodes.find((n) => n.type === 'start');
  const seen = new Set<string>();
  const slots: FlowSlot[] = [];
  const keys = new Set<string>();

  const visit = (id: string) => {
    const node = byId.get(id);
    if (node?.type === 'question' && !keys.has(node.data.slot.key)) {
      keys.add(node.data.slot.key);
      slots.push(node.data.slot);
    }
  };

  if (start) {
    const queue = [start.id];
    while (queue.length) {
      const id = queue.shift()!;
      if (seen.has(id)) continue;
      seen.add(id);
      visit(id);
      for (const e of graph.edges) if (e.source === id) queue.push(e.target);
    }
  }
  for (const node of graph.nodes) visit(node.id);
  return slots;
}
