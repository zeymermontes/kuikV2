import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepGraphUnits, spanishSlotParser, unitsOf, type GraphRunState, type GraphStep } from '../lib/whatsapp/flows/engine';
import type { FlowGraph } from '../lib/whatsapp/flows/schema';

// A Friday.
const TODAY = '2026-11-06';
const at = { x: 0, y: 0 };
const ctx = { parse: spanishSlotParser(TODAY) };

const BOOKING: FlowGraph = {
  nodes: [
    { id: 'start', type: 'start', position: at, data: {} },
    { id: 'hi', type: 'message', position: at, data: { body: 'Con gusto.' } },
    { id: 'q_party', type: 'question', position: at, data: { slot: { key: 'party_size', label: 'Personas', type: 'number', min: 1, max: 50 }, prompt: '¿Para cuántas personas?' } },
    { id: 'q_date', type: 'question', position: at, data: { slot: { key: 'date', label: 'Fecha', type: 'date' }, prompt: '¿Qué día?' } },
    { id: 'q_time', type: 'question', position: at, data: { slot: { key: 'time', label: 'Hora', type: 'time' }, prompt: '¿A qué hora?' } },
    { id: 'q_area', type: 'question', position: at, data: { slot: { key: 'area', label: 'Área', type: 'choice', options: [{ id: 'salon', title: 'Salón' }, { id: 'terraza', title: 'Terraza' }] }, prompt: '¿Salón o terraza?' } },
    { id: 'q_name', type: 'question', position: at, data: { slot: { key: 'customer_name', label: 'Nombre', type: 'text' }, prompt: '¿A nombre de quién?' } },
    { id: 'confirm', type: 'confirm', position: at, data: { body: '{{party_size}} personas el {{date}} a las {{time}}, {{customer_name}}. ¿Correcto?' } },
    { id: 'act', type: 'action', position: at, data: { kind: 'create_reservation' } },
    { id: 'end_ok', type: 'end', position: at, data: { outcome: 'completed' } },
  ],
  edges: [
    { id: 'e0', source: 'start', target: 'hi' },
    { id: 'e1', source: 'hi', target: 'q_party' },
    { id: 'e2', source: 'q_party', target: 'q_date' },
    { id: 'e3', source: 'q_date', target: 'q_time' },
    { id: 'e4', source: 'q_time', target: 'q_area' },
    { id: 'e5', source: 'q_area', target: 'q_name' },
    { id: 'e6', source: 'q_name', target: 'confirm' },
    { id: 'e7', source: 'confirm', sourceHandle: 'yes', target: 'act' },
    { id: 'e8', source: 'act', target: 'end_ok' },
  ],
};

const fresh: GraphRunState = { currentNodeId: null, answers: {} };
const say = (state: GraphRunState, ...messages: string[]) =>
  stepGraphUnits(BOOKING, state, unitsOf({ text: messages.join('\n'), parts: messages.map((text) => ({ text })) }), ctx);
const lastBody = (s: GraphStep) => s.replies[s.replies.length - 1]?.body;

test('one answer at a time still works exactly as before', async () => {
  let s = await say(fresh, 'quiero reservar');
  assert.equal(s.state.currentNodeId, 'q_party');
  assert.deepEqual(s.replies.map((r) => r.body), ['Con gusto.', '¿Para cuántas personas?']);
  s = await say(s.state, '4');
  assert.equal(lastBody(s), '¿Qué día?');
  s = await say(s.state, 'mañana');
  s = await say(s.state, '8');
  assert.equal(s.state.answers.time, '20:00');
  assert.equal(lastBody(s), '¿Salón o terraza?');
});

test('the message that starts the flow may already say it all', async () => {
  const s = await say(fresh, 'Hola, quiero reservar para 4 personas mañana a las 8pm en la terraza');
  assert.deepEqual(s.state.answers, { party_size: 4, date: '2026-11-07', time: '20:00', area: 'terraza' });
  // Asked next: the first thing they did not say. Only once, and after the greeting.
  assert.deepEqual(s.replies.map((r) => r.body), ['Con gusto.', '¿A nombre de quién?']);
  assert.deepEqual(s.captured.map((c) => c.key), ['party_size', 'date', 'time', 'area']);
});

test('a trigger with nothing in it answers nothing', async () => {
  const s = await say(fresh, 'Reservar');
  assert.deepEqual(s.state.answers, {});
  assert.equal(s.state.currentNodeId, 'q_party');
});

test('three messages in a row are three answers', async () => {
  const asked = (await say(fresh, 'reservar')).state;
  const s = await say(asked, '4', 'el sábado', 'a las 9');
  assert.deepEqual(s.state.answers, { party_size: 4, date: '2026-11-07', time: '21:00' });
  assert.equal(lastBody(s), '¿Salón o terraza?');
  assert.equal(s.replies.length, 1);
});

test('one sentence that answers the question and the next two', async () => {
  const asked = (await say(fresh, 'reservar')).state;
  const s = await say(asked, 'somos 6, el domingo a las 3 de la tarde');
  assert.deepEqual(s.state.answers, { party_size: 6, date: '2026-11-08', time: '15:00' });
});

test('a bare number never answers a question nobody asked', async () => {
  const asked = (await say(fresh, 'reservar')).state;
  // "13" is the party; "8" could be the day or the hour: it is asked, not guessed.
  const s = await say(asked, '13', 'El dia sabado', '8', 'Zeymer Montes', 'Mi cumpleaños');
  assert.deepEqual(s.state.answers, { party_size: 13, date: '2026-11-07' });
  assert.equal(lastBody(s), '¿A qué hora?');
});

test('free text is never guessed, and a summary is never confirmed unread', async () => {
  const state: GraphRunState = { currentNodeId: 'q_area', answers: { party_size: 4, date: '2026-11-07', time: '20:00' } };
  // "sí" was not said to the summary: it has not been shown yet.
  const s = await say(state, 'terraza', 'sí');
  assert.equal(s.state.currentNodeId, 'q_name');
  assert.equal(s.state.answers.customer_name, undefined);
  assert.equal(lastBody(s), '¿A nombre de quién?');
});

test('a name sent in two messages is one name', async () => {
  const state: GraphRunState = { currentNodeId: 'q_name', answers: { party_size: 4, date: '2026-11-07', time: '20:00', area: 'salon' } };
  const s = await say(state, 'Zeymer', 'Montes');
  assert.equal(s.state.answers.customer_name, 'Zeymer Montes');
  // And the summary is read back; nothing is booked on this turn.
  assert.equal(s.state.currentNodeId, 'confirm');
  assert.deepEqual(s.actions, []);
});

test('"sí" and "gracias" in two messages confirm the summary that was shown', async () => {
  const state: GraphRunState = { currentNodeId: 'confirm', answers: { party_size: 4, date: '2026-11-07', time: '20:00', area: 'salon', customer_name: 'Ana' } };
  const s = await say(state, 'sí', 'gracias');
  assert.equal(s.outcome, 'completed');
  assert.deepEqual(s.actions.map((a) => a.kind), ['create_reservation']);
});

test('an answer split in two messages: "somos" then "4"', async () => {
  const asked = (await say(fresh, 'reservar')).state;
  const s = await say(asked, 'somos', '4');
  assert.equal(s.state.answers.party_size, 4);
  assert.equal(lastBody(s), '¿Qué día?');
});

test('something unreadable is asked again, and what follows is not forced in', async () => {
  const asked = (await say(fresh, 'reservar')).state;
  const s = await say(asked, 'pues no sé', 'luego te digo');
  assert.deepEqual(s.state.answers, {});
  assert.equal(s.state.currentNodeId, 'q_party');
  assert.equal(lastBody(s), '¿Para cuántas personas?');
});

test('a day the restaurant cannot take is said, and the day is asked again with the rest kept', async () => {
  const asked = (await say(fresh, 'reservar')).state;
  const units = unitsOf({ text: '', parts: [{ text: '4' }, { text: 'el domingo a las 8pm' }] });
  const s = await stepGraphUnits(BOOKING, asked, units, ctx, async (c) => (c.key === 'date' ? 'Ese día estamos cerrados.' : null));
  assert.deepEqual(s.state.answers, { party_size: 4 });
  assert.equal(s.state.currentNodeId, 'q_date');
  assert.deepEqual(s.replies.map((r) => r.body), ['Ese día estamos cerrados.', '¿Qué día?']);
  assert.deepEqual(s.captured.map((c) => c.key), ['party_size']);
});

test('a list written with bullets or numbers is read line by line', () => {
  assert.deepEqual(
    unitsOf({ text: '- 4 personas\n• mañana\n3) a las 8' }).map((u) => u.text),
    ['4 personas', 'mañana', 'a las 8'],
  );
  // A tapped button is one piece whatever its title says.
  assert.deepEqual(unitsOf({ text: 'Sí, confirmar', replyId: 'flow_yes' }), [{ text: 'Sí, confirmar', replyId: 'flow_yes' }]);
});

test('two number questions are not both answered by the same words', async () => {
  const graph: FlowGraph = {
    nodes: [
      { id: 'start', type: 'start', position: at, data: {} },
      { id: 'q_a', type: 'question', position: at, data: { slot: { key: 'adults', label: 'Adultos', type: 'number' }, prompt: '¿Cuántos adultos?' } },
      { id: 'q_k', type: 'question', position: at, data: { slot: { key: 'kids', label: 'Niños', type: 'number' }, prompt: '¿Cuántos niños?' } },
      { id: 'end', type: 'end', position: at, data: { outcome: 'completed' } },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'q_a' },
      { id: 'e2', source: 'q_a', target: 'q_k' },
      { id: 'e3', source: 'q_k', target: 'end' },
    ],
  };
  const s = await stepGraphUnits(graph, fresh, unitsOf({ text: 'reservar para 4 personas' }), ctx);
  assert.deepEqual(s.state.answers, { adults: 4 });
  assert.equal(lastBody(s), '¿Cuántos niños?');
});
