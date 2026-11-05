import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CODE_ALPHABET, CODE_LENGTH, cleanCode, cleanName, deviceStatus, formatCode, isCode, isDeviceRole, newCode } from '../lib/devices/code';

test('the alphabet has thirty-two distinct symbols and none of the look-alikes', () => {
  assert.equal(CODE_ALPHABET.length, 32);
  assert.equal(new Set(CODE_ALPHABET).size, 32);
  for (const ch of 'ILOU') assert.equal(CODE_ALPHABET.includes(ch), false, ch);
});

test('a new code is eight symbols of the alphabet, one per random byte', () => {
  for (let i = 0; i < 200; i++) assert.equal(isCode(newCode()), true);
  // Every byte value lands on a symbol: the top three bits are dropped.
  const seen = new Set<string>();
  for (let v = 0; v < 256; v++) {
    const code = newCode((b) => b.fill(v));
    assert.equal(code, CODE_ALPHABET[v & 31].repeat(CODE_LENGTH));
    seen.add(code[0]);
  }
  assert.equal(seen.size, 32);
});

test('two codes in a row are not the same', () => {
  assert.notEqual(newCode(), newCode());
});

test('what was typed is read as the code it was meant to be', () => {
  assert.equal(cleanCode('abcd-2345'), 'ABCD2345');
  assert.equal(cleanCode('  ab cd 23 45 '), 'ABCD2345');
  // The letters a code never has are the digits they look like.
  assert.equal(cleanCode('OIL0-1xyz'), '01101XYZ');
  assert.equal(cleanCode(''), '');
  assert.equal(cleanCode('¡hola!'), 'H01A');
});

test('only eight symbols of the alphabet make a code', () => {
  assert.equal(isCode('ABCD2345'), true);
  assert.equal(isCode('ABCD234'), false);
  assert.equal(isCode('ABCD23456'), false);
  assert.equal(isCode('ABCD234U'), false);
  assert.equal(isCode('abcd2345'), false);
  assert.equal(isCode(''), false);
});

test('a code is shown in two groups, and typing it back gives the same code', () => {
  assert.equal(formatCode('ABCD2345'), 'ABCD-2345');
  assert.equal(formatCode('ABC'), 'ABC');
  assert.equal(formatCode('ABCD'), 'ABCD');
  assert.equal(formatCode('ABCDE'), 'ABCD-E');
  for (let i = 0; i < 50; i++) {
    const code = newCode();
    assert.equal(cleanCode(formatCode(code)), code);
    assert.equal(cleanCode(formatCode(code).toLowerCase()), code);
  }
});

test('a device is pending while its code lives, linked once used, expired otherwise', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');
  const later = '2026-11-06T12:00:00Z';
  const earlier = '2026-11-05T11:59:59Z';
  assert.equal(deviceStatus({ user_id: null, code_hash: 'h', code_expires_at: later }, now), 'pending');
  assert.equal(deviceStatus({ user_id: null, code_hash: 'h', code_expires_at: earlier }, now), 'expired');
  assert.equal(deviceStatus({ user_id: null, code_hash: null, code_expires_at: null }, now), 'expired');
  assert.equal(deviceStatus({ user_id: 'u', code_hash: null, code_expires_at: null }, now), 'linked');
  // Being linked again: the new code is what the owner is waiting on.
  assert.equal(deviceStatus({ user_id: 'u', code_hash: 'h', code_expires_at: later }, now), 'pending');
  // A second code that ran out leaves the device as it was.
  assert.equal(deviceStatus({ user_id: 'u', code_hash: 'h', code_expires_at: earlier }, now), 'linked');
});

test('a shared device is never an owner or a manager', () => {
  for (const r of ['cashier', 'waiter', 'host']) assert.equal(isDeviceRole(r), true, r);
  for (const r of ['owner', 'manager', 'super_admin', '', null, undefined, 3]) assert.equal(isDeviceRole(r), false, String(r));
});

test('a name is trimmed, single-spaced and capped', () => {
  assert.equal(cleanName('  Caja   2 \n'), 'Caja 2');
  assert.equal(cleanName('   '), '');
  assert.equal(cleanName('x'.repeat(200)).length, 60);
});
