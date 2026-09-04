/**
 * The flows a restaurant starts with, and the converter that turns a tenant's
 * old goal into one.
 *
 * Pure on purpose (no server imports): seed.ts and the backfill route feed
 * these to the database, tests exercise the graphs directly, and the canvas
 * can offer them as starting points.
 *
 * The graphs carry real canvas positions so the first time an owner opens the
 * editor they see a readable left-to-right chain, not a pile at the origin.
 */

import type { Trigger } from '../intent';
import type { FlowActionKind, FlowGraph, FlowNode, FlowSlot } from './schema';

export interface FlowTemplate {
  key: string;
  name: string;
  description: string;
  priority: number;
  mode: 'linear' | 'ai';
  triggers: Trigger[];
  nudge_after_minutes: number | null;
  max_nudges: number;
  nudge_message: string | null;
  close_after_minutes: number | null;
  close_message: string | null;
  graph: FlowGraph;
}

const COL = 300;
const pos = (col: number, row = 0) => ({ x: col * COL, y: row * 140 });

/** A straight chain of questions ending in confirm → action → end. */
function chain(parts: {
  questions: { slot: FlowSlot; prompt: string; retryPrompt?: string }[];
  confirm?: string;
  action?: { kind: FlowActionKind };
  endBody?: string;
  cancelBody?: string;
}): FlowGraph {
  const nodes: FlowNode[] = [{ id: 'start', type: 'start', position: pos(0), data: {} }];
  const edges: FlowGraph['edges'] = [];
  let col = 1;
  let prev = 'start';

  const link = (from: string, to: string, handle?: string) => {
    edges.push({ id: `e_${from}_${to}`, source: from, ...(handle ? { sourceHandle: handle } : {}), target: to });
  };

  for (const q of parts.questions) {
    const id = `q_${q.slot.key}`;
    nodes.push({ id, type: 'question', position: pos(col++), data: {
      slot: q.slot, prompt: q.prompt, ...(q.retryPrompt ? { retryPrompt: q.retryPrompt } : {}),
    } });
    link(prev, id);
    prev = id;
  }

  if (parts.confirm) {
    nodes.push({ id: 'confirm', type: 'confirm', position: pos(col++), data: { body: parts.confirm } });
    link(prev, 'confirm');
    prev = 'confirm';
  }

  if (parts.action) {
    nodes.push({ id: 'act', type: 'action', position: pos(col++), data: { kind: parts.action.kind } });
    link(prev, 'act', parts.confirm ? 'yes' : undefined);
    prev = 'act';
  }

  nodes.push({ id: 'end_ok', type: 'end', position: pos(col), data: {
    ...(parts.endBody ? { body: parts.endBody } : {}), outcome: 'completed',
  } });
  link(prev, 'end_ok', parts.confirm && !parts.action ? 'yes' : undefined);

  if (parts.confirm) {
    nodes.push({ id: 'end_no', type: 'end', position: pos(col, 1), data: {
      body: parts.cancelBody ?? 'Sin problema 👍 ¿Te ayudo con algo más?', outcome: 'canceled',
    } });
    link('confirm', 'end_no', 'no');
  }

  return { nodes, edges };
}

/** A flow that says something (optionally does something) and ends. */
function announcement(body: string, actionKind?: FlowActionKind): FlowGraph {
  const nodes: FlowNode[] = [
    { id: 'start', type: 'start', position: pos(0), data: {} },
    { id: 'msg', type: 'message', position: pos(1), data: { body } },
    ...(actionKind
      ? [{ id: 'act', type: 'action', position: pos(2), data: { kind: actionKind } } as FlowNode]
      : []),
    { id: 'end', type: 'end', position: pos(actionKind ? 3 : 2), data: { outcome: 'completed' as const } },
  ];
  const chainIds = nodes.map((n) => n.id);
  return {
    nodes,
    edges: chainIds.slice(1).map((target, i) => ({
      id: `e_${chainIds[i]}_${target}`, source: chainIds[i], target,
    })),
  };
}

const kw = (...values: string[]): Trigger[] => values.map((value) => ({ kind: 'keyword', value }));

export const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    key: 'reservation',
    name: 'Reservar mesa',
    description: 'Reservar una mesa o un salón privado.',
    priority: 100,
    // 'ai' means: the model leads WHEN the tenant has AI switched on and paid
    // for; otherwise the graph is walked verbatim. Same seeded row serves both.
    mode: 'ai',
    triggers: kw('reservar', 'reservacion', 'reserva', 'mesa', 'apartar'),
    nudge_after_minutes: 15,
    max_nudges: 2,
    nudge_message: null,
    close_after_minutes: 60,
    close_message: 'Dejo tu reservación pendiente por ahora 🙌 Escríbenos cuando quieras retomarla.',
    graph: chain({
      questions: [
        { slot: { key: 'party_size', label: 'Personas', type: 'number', min: 1, max: 50 }, prompt: '¿Para cuántas personas? 🍽️' },
        { slot: { key: 'date', label: 'Fecha', type: 'date' }, prompt: '¿Qué día te gustaría venir?' },
        { slot: { key: 'time', label: 'Hora', type: 'time' }, prompt: '¿A qué hora?' },
        { slot: { key: 'customer_name', label: 'Nombre', type: 'text' }, prompt: '¿A nombre de quién la dejo?' },
      ],
      confirm: 'Confirmo: {{party_size}} personas el {{date}} a las {{time}}, a nombre de {{customer_name}}. ¿Está bien?',
      action: { kind: 'create_reservation' },
    }),
  },
  {
    key: 'hours',
    name: 'Horarios',
    description: 'Consultar a qué hora abre y cierra el restaurante.',
    priority: 80,
    mode: 'linear',
    triggers: kw('horario', 'horarios', 'abren', 'cierran', 'abierto'),
    nudge_after_minutes: null,
    max_nudges: 0,
    nudge_message: null,
    close_after_minutes: null,
    close_message: null,
    graph: announcement('Nuestro horario es:\n{{horario_semana}}'),
  },
  {
    key: 'menu',
    name: 'Ver el menú',
    description: 'Ver el menú y los precios.',
    priority: 70,
    mode: 'linear',
    triggers: kw('menu', 'carta', 'precio', 'precios', 'cuesta', 'cuanto'),
    nudge_after_minutes: null,
    max_nudges: 0,
    nudge_message: null,
    close_after_minutes: null,
    close_message: null,
    graph: announcement('Aquí está nuestro menú completo con precios 📖\n{{menu_url}}'),
  },
  {
    key: 'location',
    name: 'Cómo llegar',
    description: 'Consultar la dirección y cómo llegar.',
    priority: 60,
    mode: 'linear',
    triggers: kw('direccion', 'ubicacion', 'donde', 'llegar', 'mapa'),
    nudge_after_minutes: null,
    max_nudges: 0,
    nudge_message: null,
    close_after_minutes: null,
    close_message: null,
    graph: announcement('Estamos en {{direccion}} 📍\n{{mapa}}'),
  },
  {
    key: 'human',
    name: 'Hablar con alguien',
    description: 'Pasar la conversación a una persona del restaurante.',
    priority: 10,
    mode: 'linear',
    triggers: kw('humano', 'persona', 'agente'),
    nudge_after_minutes: null,
    max_nudges: 0,
    nudge_message: null,
    close_after_minutes: null,
    close_message: null,
    graph: announcement('Claro, en un momento te atiende una persona 🙋', 'handoff'),
  },
];

/* ------------------------------------------------------------- goal → flow */

interface LegacyGoal {
  key: string;
  name: string;
  description: string | null;
  priority: number;
  enabled: boolean;
  triggers: Trigger[];
  resolver: 'flow' | 'reply' | 'ai';
  reply_body: string | null;
  flow: {
    slots: { key: string; type: string; prompt: string; required?: boolean; min?: number; max?: number;
             options?: { id: string; title: string; description?: string }[] }[];
    confirm?: { body: string };
    onConfirm?: 'create_reservation' | 'notify_staff' | 'none';
    onCancel?: string;
  } | null;
  action: string | null;
}

const SLOT_LABELS: Record<string, string> = {
  party_size: 'Personas', date: 'Fecha', time: 'Hora',
  customer_name: 'Nombre', area: 'Área', note: 'Nota',
};

/**
 * Convert a tenant's (possibly edited) goal into a flow row. Slot lists
 * become a question chain; a reply-with-action goal becomes message → action.
 * The tenant's own wording — prompts, reply bodies, triggers — survives.
 */
export function goalToFlow(goal: LegacyGoal): Omit<FlowTemplate, 'mode'> & { mode: 'linear' | 'ai'; enabled: boolean } {
  const template = FLOW_TEMPLATES.find((t) => t.key === goal.key);
  let graph: FlowGraph;

  if (goal.resolver !== 'reply' && goal.flow?.slots?.length) {
    graph = chain({
      questions: goal.flow.slots.map((s) => ({
        slot: {
          key: s.key,
          label: SLOT_LABELS[s.key] ?? s.key,
          type: (['text', 'number', 'phone', 'email', 'date', 'time', 'choice'].includes(s.type) ? s.type : 'text') as FlowSlot['type'],
          ...(s.required === false ? { required: false } : {}),
          ...(s.min != null ? { min: s.min } : {}),
          ...(s.max != null ? { max: s.max } : {}),
          ...(s.options ? { options: s.options } : {}),
        },
        prompt: s.prompt,
      })),
      ...(goal.flow.confirm ? { confirm: goal.flow.confirm.body } : {}),
      ...(goal.flow.onConfirm && goal.flow.onConfirm !== 'none' ? { action: { kind: goal.flow.onConfirm } } : {}),
      ...(goal.flow.onCancel ? { cancelBody: goal.flow.onCancel } : {}),
    });
  } else if (goal.reply_body && goal.action && goal.action !== 'none') {
    graph = announcement(goal.reply_body, goal.action as FlowActionKind);
  } else {
    graph = announcement(goal.reply_body ?? '…');
  }

  return {
    key: goal.key,
    name: goal.name,
    description: goal.description ?? '',
    priority: goal.priority,
    enabled: goal.enabled,
    mode: goal.key === 'reservation' ? 'ai' : 'linear',
    triggers: goal.triggers,
    nudge_after_minutes: template?.nudge_after_minutes ?? null,
    max_nudges: template?.max_nudges ?? 0,
    nudge_message: template?.nudge_message ?? null,
    close_after_minutes: template?.close_after_minutes ?? null,
    close_message: template?.close_message ?? null,
    graph,
  };
}
