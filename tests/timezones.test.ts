import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TIMEZONES, isValidTimeZone } from '../lib/timezones';
import { nowHHMMInTz } from '../lib/time';

test('every offered zone is one the runtime can read', () => {
  for (const z of TIMEZONES) assert.ok(isValidTimeZone(z.id), z.id);
  assert.equal(new Set(TIMEZONES.map((z) => z.id)).size, TIMEZONES.length);
});

test('what is not a zone is refused, offsets included', () => {
  for (const bad of ['', 'UTC-7', 'GMT+1', 'America/Nowhere', 'Mexico', 'drop table; --', 'a'.repeat(70)]) {
    assert.equal(isValidTimeZone(bad), false, bad);
  }
});

test('the Pacific zone runs an hour behind the centre of Mexico', () => {
  const at = new Date('2026-11-10T04:30:00Z');
  assert.equal(nowHHMMInTz('America/Mexico_City', at), '22:30');
  assert.equal(nowHHMMInTz('America/Mazatlan', at), '21:30');
});
