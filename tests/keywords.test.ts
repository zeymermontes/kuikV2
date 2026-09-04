import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesAnyKeyword } from '../lib/whatsapp/intent';

const HANDOFF = ['humano', 'asesor', 'persona', 'operador', 'agente'];

test('"2 personas" mid-booking must NOT hand off — the bug that muted the bot', () => {
  assert.equal(matchesAnyKeyword(HANDOFF, '2 personas'), false);
  assert.equal(matchesAnyKeyword(HANDOFF, 'somos 4 personas'), false);
  assert.equal(matchesAnyKeyword(HANDOFF, 'personal'), false);
});

test('genuine handoff requests still trigger, accents included', () => {
  assert.equal(matchesAnyKeyword(HANDOFF, 'quiero hablar con una persona'), true);
  assert.equal(matchesAnyKeyword(HANDOFF, 'Pásame con un HUMANO por favor'), true);
  assert.equal(matchesAnyKeyword(HANDOFF, 'agente'), true);
});

test('multi-word keywords match as a phrase', () => {
  const optout = ['baja', 'stop', 'cancelar suscripcion'];
  assert.equal(matchesAnyKeyword(optout, 'quiero cancelar suscripción ya'), true);
  assert.equal(matchesAnyKeyword(optout, 'cancelar mi reserva'), false);
  // "baja" as a word, not inside another one.
  assert.equal(matchesAnyKeyword(optout, 'dame de baja'), true);
  assert.equal(matchesAnyKeyword(optout, 'la mesa más bajable'), false);
});
