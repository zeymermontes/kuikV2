import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkGrounding } from '../lib/ai/guard';

test('a price the tool returned passes', () => {
  assert.deepEqual(checkGrounding('Los camarones cuestan $320.', ['320']), { ok: true, invented: [] });
});

test('THE failure this exists for: an invented price is blocked', () => {
  const r = checkGrounding('Los camarones cuestan $280.', ['320']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.invented, ['280']);
});

test('formatting differences do not count as invention', () => {
  assert.ok(checkGrounding('Cuesta $1,250.00', ['1250']).ok);
  assert.ok(checkGrounding('Cuesta 1250 pesos', ['1250']).ok);
  assert.ok(checkGrounding('Cuesta $1,250', ['1250.00']).ok);
});

test('several prices, one of them made up', () => {
  const r = checkGrounding('Camarones $320, pulpo $410 y el postre $95.', ['320', '410']);
  assert.equal(r.ok, false);
  assert.deepEqual(r.invented, ['95']);
});

test('small numbers are counts, not prices', () => {
  assert.ok(checkGrounding('Mesa para 4 personas a las 8.', []).ok);
});

test('a reply with no money at all is fine', () => {
  assert.ok(checkGrounding('Claro, ¿para cuántas personas?', []).ok);
});

test('pesos and mxn spellings are caught too', () => {
  assert.equal(checkGrounding('Son 450 pesos', ['320']).ok, false);
  assert.equal(checkGrounding('Son 450 MXN', ['320']).ok, false);
});
