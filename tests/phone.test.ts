import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toE164, normalizeWaId, waIdCandidates, sameNumber } from '../lib/phone';

test('mexican wa_id drops the WhatsApp 1', () => {
  assert.equal(normalizeWaId('5215512345678'), '+525512345678');
  assert.equal(normalizeWaId('525512345678'), '+525512345678');
});

test('toE164 accepts the shapes humans type', () => {
  for (const input of ['+52 55 1234 5678', '5512345678', '044 55 1234 5678',
                       '01 55 1234 5678', '+525512345678', '(55) 1234-5678']) {
    assert.equal(toE164(input), '+525512345678', `failed on ${input}`);
  }
});

test('toE164 canonicalises a wa_id too', () => {
  assert.equal(toE164('5215512345678'), '+525512345678');
});

test('THE bug this file exists for: wa_id matches a typed number', () => {
  assert.ok(sameNumber('5215512345678', '+52 55 1234 5678'));
  // and the naive approach that is in the codebase today does not:
  const digitsOnly = (s: string) => s.replace(/\D/g, '');
  assert.notEqual(digitsOnly('5215512345678'), digitsOnly('+52 55 1234 5678'));
});

test('argentina keeps its mobile 9 (it is real E.164)', () => {
  assert.equal(toE164('+54 9 11 1234 5678', 'AR'), '+5491112345678');
});

test('garbage is rejected rather than guessed', () => {
  for (const bad of ['', 'hola', '123', '+1']) assert.equal(toE164(bad), null, `accepted ${bad}`);
});

test('waIdCandidates offers both mexican forms', () => {
  assert.deepEqual(waIdCandidates('+525512345678'), ['525512345678', '5215512345678']);
});
