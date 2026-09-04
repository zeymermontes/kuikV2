import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stepGraph, resumeNodeId, spanishSlotParser, GRAPH_YES,
  type GraphRunState,
} from '../lib/whatsapp/flows/engine';
import {
  flowGraphSchema, validateGraph, slotsOf,
  type FlowGraph, type FlowNode,
} from '../lib/whatsapp/flows/schema';

const TODAY = '2026-08-25';

const at = { x: 0, y: 0 };

/** The seeded booking flow, as the canvas would draw it: a straight chain. */
const BOOKING: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: at, data: {} },
    { id: 'q_party', type: 'question', position: at, data: {
      slot: { key: 'party_size', label: 'Personas', type: 'number', min: 1, max: 50 },
      prompt: '¿Para cuántas personas?',
    } },
    { id: 'q_date', type: 'question', position: at, data: {
      slot: { key: 'date', label: 'Fecha', type: 'date' },
      prompt: '¿Qué día?',
    } },
    { id: 'q_time', type: 'question', position: at, data: {
      slot: { key: 'time', label: 'Hora', type: 'time' },
      prompt: '¿A qué hora?',
    } },
    { id: 'q_name', type: 'question', position: at, data: {
      slot: { key: 'customer_name', label: 'Nombre', type: 'text' },
      prompt: '¿A nombre de quién?',
    } },
    { id: 'confirm', type: 'confirm', position: at, data: {
      body: '{{party_size}} personas el {{date}} a las {{time}}, a nombre de {{customer_name}}. ¿Correcto?',
    } },
    { id: 'act', type: 'action', position: at, data: { kind: 'create_reservation' } },
    { id: 'end_ok', type: 'end', position: at, data: { outcome: 'completed' } },
    { id: 'end_no', type: 'end', position: at, data: { body: 'Sin problema.', outcome: 'canceled' } },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'q_party' },
    { id: 'e2', source: 'q_party', target: 'q_date' },
    { id: 'e3', source: 'q_date', target: 'q_time' },
    { id: 'e4', source: 'q_time', target: 'q_name' },
    { id: 'e5', source: 'q_name', target: 'confirm' },
    { id: 'e6', source: 'confirm', sourceHandle: 'yes', target: 'act' },
    { id: 'e7', source: 'confirm', sourceHandle: 'no', target: 'end_no' },
    { id: 'e8', source: 'act', target: 'end_ok' },
  ],
};

// The literal parser the runtime and the simulator use.
const ctx = { parse: spanishSlotParser(TODAY) };

/**
 * Drive a whole conversation. The first turn is the trigger message — it
 * answers nothing, it just starts the walk (same contract as flow.ts).
 */
function converse(turns: string[], graph: FlowGraph = BOOKING) {
  let state: GraphRunState = { currentNodeId: null, answers: {} };
  let last = stepGraph(graph, state, { text: 'quiero reservar' }, ctx);
  state = last.state;
  for (const text of turns) {
    last = stepGraph(graph, state, { text }, ctx);
    state = last.state;
  }
  return last;
}

function filledState(): GraphRunState {
  return converse(['2', 'viernes', '21:00', 'Ana']).state;
}

test('the trigger turn walks to the first question', () => {
  const first = stepGraph(BOOKING, { currentNodeId: null, answers: {} }, { text: 'quiero reservar' }, ctx);
  assert.equal(first.state.currentNodeId, 'q_party');
  assert.match(first.replies[0].body, /cuántas personas/);
});

test('a whole booking, typed the way people type', () => {
  const end = converse(['4', 'mañana', '8pm', 'Zeymer', GRAPH_YES]);
  assert.equal(end.outcome, 'completed');
  assert.equal(end.actions.length, 1);
  assert.equal(end.actions[0].kind, 'create_reservation');
  assert.deepEqual(end.actions[0].args, {
    party_size: 4, date: '2026-08-26', time: '20:00', customer_name: 'Zeymer',
  });
});

test('the summary is read back before anything is booked', () => {
  const before = converse(['2', 'viernes', '21:00', 'Ana']);
  assert.equal(before.state.currentNodeId, 'confirm');
  assert.equal(before.actions.length, 0, 'must not book before confirmation');
  assert.match(before.replies[0].body, /2 personas el 2026-08-28 a las 21:00, a nombre de Ana/);
});

test('saying no takes the no-branch and cancels', () => {
  const end = stepGraph(BOOKING, filledState(), { text: 'mejor no' }, ctx);
  assert.equal(end.actions.length, 0);
  assert.equal(end.outcome, 'canceled');
  assert.match(end.endBody?.body ?? '', /Sin problema/);
});

test('accented "sí" confirms — JS \\b is ASCII-only and used to break this', () => {
  for (const yes of ['sí', 'Sí, correcto', 'si', 'ok', 'dale', 'claro que sí']) {
    const end = stepGraph(BOOKING, filledState(), { text: yes }, ctx);
    assert.equal(end.actions[0]?.kind, 'create_reservation', `"${yes}" should confirm`);
  }
});

test('an ambiguous confirmation re-asks instead of assuming yes', () => {
  const muddled = stepGraph(BOOKING, filledState(), { text: 'mmm no sé' }, ctx);
  assert.equal(muddled.actions.length, 0);
  assert.equal(muddled.state.currentNodeId, 'confirm');
  assert.equal(muddled.replies[0].buttons?.length, 2);
});

test('unparseable input re-asks with the retry prompt and records nothing', () => {
  const graph: FlowGraph = structuredClone(BOOKING);
  const q = graph.nodes.find((n) => n.id === 'q_party')!;
  if (q.type === 'question') q.data.retryPrompt = 'Solo el número, porfa.';
  const first = stepGraph(graph, { currentNodeId: null, answers: {} }, { text: 'reservar' }, ctx);
  const second = stepGraph(graph, first.state, { text: 'cuando sea' }, ctx);
  assert.equal(second.state.currentNodeId, 'q_party');
  assert.equal(second.state.answers.party_size, undefined);
  assert.match(second.replies[0].body, /Solo el número/);
});

test('captures carry the source: button vs typed text', () => {
  const first = stepGraph(BOOKING, { currentNodeId: null, answers: {} }, { text: 'reservar' }, ctx);
  const typed = stepGraph(BOOKING, first.state, { text: 'somos cuatro' }, ctx);
  assert.deepEqual(typed.captured, [{ key: 'party_size', value: 4, source: 'text' }]);
});

/** A choice question whose options branch directly, Intercom-style. */
const AREAS: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: at, data: {} },
    { id: 'q_area', type: 'question', position: at, data: {
      slot: { key: 'area', label: 'Área', type: 'choice', options: [
        { id: 'salon', title: 'Salón' }, { id: 'terraza', title: 'Terraza' },
      ] },
      prompt: '¿Dónde te gustaría?',
    } },
    { id: 'm_terraza', type: 'message', position: at, data: { body: 'La terraza depende del clima.' } },
    { id: 'end', type: 'end', position: at, data: { body: 'Listo, {{area}} anotado.' } },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'q_area' },
    { id: 'e2', source: 'q_area', sourceHandle: 'terraza', target: 'm_terraza' },
    { id: 'e3', source: 'q_area', target: 'end' },
    { id: 'e4', source: 'm_terraza', target: 'end' },
  ],
};

test('a tapped option leaves through its own edge', () => {
  const first = stepGraph(AREAS, { currentNodeId: null, answers: {} }, { text: 'hola' });
  assert.equal(first.replies[0].buttons?.length, 2);
  const picked = stepGraph(AREAS, first.state, { text: 'Terraza', replyId: 'terraza' });
  assert.match(picked.replies[0].body, /depende del clima/);
  assert.match(picked.endBody?.body ?? '', /terraza anotado/);
  assert.equal(picked.outcome, 'completed');
});

test('an option without its own edge takes the default exit', () => {
  const first = stepGraph(AREAS, { currentNodeId: null, answers: {} }, { text: 'hola' });
  const picked = stepGraph(AREAS, first.state, { text: '', replyId: 'salon' });
  assert.equal(picked.replies.length, 0);
  assert.match(picked.endBody?.body ?? '', /salon anotado/);
});

/** A numeric branch: big groups get told a human will call. */
const GROUPS: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: at, data: {} },
    { id: 'q_party', type: 'question', position: at, data: {
      slot: { key: 'party_size', label: 'Personas', type: 'number', min: 1, max: 50 },
      prompt: '¿Cuántos son?',
    } },
    { id: 'br', type: 'branch', position: at, data: {
      conditions: [{ id: 'big', slot: 'party_size', op: 'gt', value: 8 }],
    } },
    { id: 'act_handoff', type: 'action', position: at, data: { kind: 'handoff' } },
    { id: 'end_big', type: 'end', position: at, data: { body: 'Para grupos grandes te contactamos directo.' } },
    { id: 'end_ok', type: 'end', position: at, data: { body: 'Perfecto.' } },
  ],
  edges: [
    { id: 'e1', source: 'start', target: 'q_party' },
    { id: 'e2', source: 'q_party', target: 'br' },
    { id: 'e3', source: 'br', sourceHandle: 'big', target: 'act_handoff' },
    { id: 'e4', source: 'br', sourceHandle: 'else', target: 'end_ok' },
    { id: 'e5', source: 'act_handoff', target: 'end_big' },
  ],
};

test('branch conditions route on the captured answer', () => {
  const first = stepGraph(GROUPS, { currentNodeId: null, answers: {} }, { text: 'reservar' }, ctx);
  const big = stepGraph(GROUPS, first.state, { text: '12' }, ctx);
  assert.equal(big.actions[0]?.kind, 'handoff');
  assert.match(big.endBody?.body ?? '', /grupos grandes/);

  const small = stepGraph(GROUPS, first.state, { text: '4' }, ctx);
  assert.equal(small.actions.length, 0);
  assert.match(small.endBody?.body ?? '', /Perfecto/);
});

test('a number slot with a custom key still understands "somos cuatro"', () => {
  const custom = structuredClone(GROUPS);
  const q = custom.nodes.find((n) => n.id === 'q_party')!;
  if (q.type === 'question') q.data.slot.key = 'personas';
  const br = custom.nodes.find((n) => n.id === 'br')!;
  if (br.type === 'branch') br.data.conditions[0].slot = 'personas';
  const first = stepGraph(custom, { currentNodeId: null, answers: {} }, { text: 'hola' }, ctx);
  const typed = stepGraph(custom, first.state, { text: 'somos cuatro' }, ctx);
  assert.equal(typed.state.answers.personas, 4);
});

test('a graph with no matching edge ends the run instead of stranding it', () => {
  const broken: FlowGraph = {
    nodes: [
      { id: 'start', type: 'start', position: at, data: {} },
      { id: 'm', type: 'message', position: at, data: { body: 'hola' } },
    ],
    edges: [{ id: 'e1', source: 'start', target: 'm' }],
  };
  const end = stepGraph(broken, { currentNodeId: null, answers: {} }, { text: 'x' });
  assert.equal(end.outcome, 'completed');
});

test('resumeNodeId finds the first unanswered question, honoring branches', () => {
  assert.equal(resumeNodeId(BOOKING, {}), 'q_party');
  assert.equal(resumeNodeId(BOOKING, { party_size: 4, date: '2026-08-26' }), 'q_time');
  assert.equal(
    resumeNodeId(BOOKING, { party_size: 4, date: '2026-08-26', time: '20:00', customer_name: 'Ana' }),
    'confirm',
  );
  // Big group: the branch routes past end_ok, so nothing is left to ask.
  assert.equal(resumeNodeId(GROUPS, { party_size: 12 }), null);
});

/* ------------------------------------------------------------- validation */

test('validateGraph passes the booking graph', () => {
  assert.deepEqual(validateGraph(BOOKING), []);
  assert.deepEqual(validateGraph(GROUPS), []);
  assert.deepEqual(validateGraph(AREAS), []);
});

test('validateGraph flags structural problems', () => {
  const orphan: FlowNode = { id: 'orphan', type: 'message', position: at, data: { body: 'x' } };
  const graph: FlowGraph = {
    nodes: [...BOOKING.nodes, orphan],
    edges: [...BOOKING.edges, { id: 'eo', source: 'orphan', target: 'end_ok' }],
  };
  const codes = validateGraph(graph).map((i) => i.code);
  assert.ok(codes.includes('unreachable'));

  const noElse = structuredClone(GROUPS);
  noElse.edges = noElse.edges.filter((e) => e.sourceHandle !== 'else');
  assert.ok(validateGraph(noElse).some((i) => i.code === 'missing_else_edge'));

  const noYes = structuredClone(BOOKING);
  noYes.edges = noYes.edges.filter((e) => e.sourceHandle !== 'yes');
  assert.ok(validateGraph(noYes).some((i) => i.code === 'missing_yes_edge'));

  const dup = structuredClone(BOOKING);
  const q = dup.nodes.find((n) => n.id === 'q_date')!;
  if (q.type === 'question') q.data.slot.key = 'party_size';
  assert.ok(validateGraph(dup).some((i) => i.code === 'duplicate_slot'));
});

test('a cycle with no waiting node is rejected; a retry loop through a question is fine', () => {
  const spin: FlowGraph = {
    nodes: [
      { id: 'start', type: 'start', position: at, data: {} },
      { id: 'a', type: 'message', position: at, data: { body: 'a' } },
      { id: 'b', type: 'message', position: at, data: { body: 'b' } },
      { id: 'end', type: 'end', position: at, data: {} },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'a' },
      { id: 'e2', source: 'a', target: 'b' },
      { id: 'e3', source: 'b', target: 'a' },
      { id: 'e4', source: 'b', target: 'end' },
    ],
  };
  assert.ok(validateGraph(spin).some((i) => i.code === 'loop_without_wait'));

  // Branch looping BACK to a question waits every lap — legal by design.
  const retry = structuredClone(GROUPS);
  retry.edges = retry.edges.map((e) =>
    e.sourceHandle === 'big' ? { ...e, target: 'q_party' } : e,
  );
  retry.nodes = retry.nodes.filter((n) => !['act_handoff', 'end_big'].includes(n.id));
  assert.ok(!validateGraph(retry).some((i) => i.code === 'loop_without_wait'));
});

test('slotsOf lists slots in the order a diner meets them', () => {
  assert.deepEqual(slotsOf(BOOKING).map((s) => s.key), ['party_size', 'date', 'time', 'customer_name']);
});

test('a React Flow export round-trips through the schema, extras stripped', () => {
  // React Flow decorates nodes with runtime fields; the schema must strip
  // them so the stored graph stays canonical.
  const exported = {
    nodes: BOOKING.nodes.map((n) => ({ ...n, selected: false, measured: { width: 200, height: 80 } })),
    edges: BOOKING.edges.map((e) => ({ ...e, animated: true })),
  };
  const parsed = flowGraphSchema.parse(exported);
  assert.deepEqual(parsed, JSON.parse(JSON.stringify(BOOKING)));
  const again = flowGraphSchema.parse(JSON.parse(JSON.stringify(parsed)));
  assert.deepEqual(again, parsed);
});
