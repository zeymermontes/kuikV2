import { test } from 'node:test';
import assert from 'node:assert/strict';
import { step, CONFIRM_YES, CONFIRM_NO, type FlowDef, type FlowState } from '../lib/whatsapp/flow';
import { parseSpanishDate, parseSpanishTime, parsePartySize } from '../lib/whatsapp/parse';

const TODAY = '2026-08-25';

const BOOKING: FlowDef = {
  slots: [
    { key: 'party_size', type: 'number', min: 1, max: 50, prompt: '¿Para cuántas personas?' },
    { key: 'date', type: 'date', prompt: '¿Qué día?' },
    { key: 'time', type: 'time', prompt: '¿A qué hora?' },
    { key: 'customer_name', type: 'text', prompt: '¿A nombre de quién?' },
  ],
  confirm: { body: '{{party_size}} personas el {{date}} a las {{time}}, a nombre de {{customer_name}}. ¿Correcto?' },
  onConfirm: 'create_reservation',
  onCancel: 'Sin problema.',
};

const ctx = {
  parse: (slot: { type: string; key: string }, raw: string) =>
    slot.type === 'date' ? parseSpanishDate(raw, TODAY)
    : slot.type === 'time' ? parseSpanishTime(raw)
    : slot.key === 'party_size' ? parsePartySize(raw)
    : null,
};

/**
 * Drive a whole conversation.
 *
 * The first turn is the message that triggered the goal ("quiero reservar") —
 * it answers nothing, it just makes the bot ask its first question. Skipping it
 * shifts every later answer onto the wrong slot, which is exactly the mistake
 * bot.ts must not make either.
 */
function converse(turns: string[], def: FlowDef = BOOKING) {
  let state: FlowState = { values: {} };
  let last = step(def, state, { text: 'quiero reservar' }, ctx);
  state = last.state;
  for (const text of turns) {
    last = step(def, state, { text }, ctx);
    state = last.state;
  }
  return last;
}

/** The state after a full set of answers, ready for the confirmation turn. */
function filledState(): FlowState {
  return converse(['2', 'viernes', '21:00', 'Ana']).state;
}

test('asks for the first slot before anything is known', () => {
  const first = step(BOOKING, { values: {} }, { text: 'quiero reservar' }, ctx);
  assert.equal(first.state.asking, 'party_size');
  assert.match(first.replies[0].body, /cuántas personas/);
});

test('a whole booking, typed the way people type', () => {
  const end = converse(['4', 'mañana', '8pm', 'Zeymer', CONFIRM_YES]);
  assert.equal(end.done, true);
  assert.deepEqual(end.action, {
    kind: 'create_reservation',
    values: { party_size: 4, date: '2026-08-26', time: '20:00', customer_name: 'Zeymer' },
  });
});

test('the summary is read back before anything is booked', () => {
  const before = converse(['2', 'viernes', '21:00', 'Ana']);
  assert.equal(before.state.confirming, true);
  assert.equal(before.action, undefined, 'must not book before confirmation');
  assert.match(before.replies[0].body, /2 personas el 2026-08-28 a las 21:00, a nombre de Ana/);
});

test('saying no throws the answers away instead of booking', () => {
  const end = step(BOOKING, filledState(), { text: CONFIRM_NO }, ctx);
  assert.equal(end.action, undefined);
  assert.deepEqual(end.state.values, {});
  assert.match(end.replies[0].body, /Sin problema/);
});

test('unparseable input re-asks rather than guessing', () => {
  const first = step(BOOKING, { values: {} }, { text: 'reservar' }, ctx);
  const second = step(BOOKING, first.state, { text: 'cuando sea' }, ctx);
  // Still on the same slot, no value recorded.
  assert.equal(second.state.asking, 'party_size');
  assert.equal(second.state.values.party_size, undefined);
});

test('an ambiguous confirmation re-asks instead of assuming yes', () => {
  const muddled = step(BOOKING, filledState(), { text: 'mmm no sé' }, ctx);
  assert.equal(muddled.action, undefined, 'must not book on an unclear answer');
  assert.equal(muddled.state.confirming, true);
});

test('tapped buttons win over text, so no parsing is needed', () => {
  const withOptions: FlowDef = {
    slots: [{
      key: 'area', type: 'choice', prompt: '¿Dónde?',
      options: [{ id: 'salon', title: 'Salón' }, { id: 'privado', title: 'Salón privado' }],
    }],
    onConfirm: 'none',
  };
  const first = step(withOptions, { values: {} }, { text: 'reservar' });
  assert.equal(first.replies[0].type, 'interactive');
  assert.equal(first.replies[0].buttons?.length, 2);

  const picked = step(withOptions, first.state, { text: 'Salón privado', replyId: 'privado' });
  assert.equal(picked.state.values.area, 'privado');
});

test('more than three options become a list, per WhatsApp limits', () => {
  const many: FlowDef = {
    slots: [{
      key: 'day', type: 'choice', prompt: '¿Qué día?',
      options: Array.from({ length: 7 }, (_, i) => ({ id: `d${i}`, title: `Día ${i}` })),
    }],
    onConfirm: 'none',
  };
  const first = step(many, { values: {} }, { text: 'x' });
  assert.equal(first.replies[0].buttons, undefined);
  assert.equal(first.replies[0].list?.sections[0].rows.length, 7);
});

test('"sí" in words works as well as the button', () => {
  const state = converse(['4', 'mañana', '8pm', 'Zeymer']).state;
  const end = step(BOOKING, state, { text: 'sí, correcto' }, ctx);
  assert.equal(end.action?.kind, 'create_reservation');
});

test('accented "sí" confirms — JS \\b is ASCII-only and used to break this', () => {
  for (const yes of ['sí', 'Sí, correcto', 'si', 'ok', 'dale', 'claro que sí']) {
    const end = step(BOOKING, filledState(), { text: yes }, ctx);
    assert.equal(end.action?.kind, 'create_reservation', `"${yes}" should confirm`);
  }
});

test('and the negatives still cancel', () => {
  for (const no of ['no', 'No', 'mejor no', 'cancelar']) {
    const end = step(BOOKING, filledState(), { text: no }, ctx);
    assert.equal(end.action, undefined, `"${no}" should not book`);
  }
});
