import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rememberTap, tapId, REMEMBERED_TAPS } from '../lib/native/push-tap';

test('a tap is acted on the first time and ignored when the intent is replayed', () => {
  const first = rememberTap('msg-1', []);
  assert.deepEqual(first, ['msg-1']);
  assert.equal(rememberTap('msg-1', first!), null);
  assert.deepEqual(rememberTap('msg-2', first!), ['msg-1', 'msg-2']);
});

test('a tap without an id is never taken for a repeat', () => {
  assert.deepEqual(rememberTap('', ['a']), ['a']);
  assert.deepEqual(rememberTap('', ['a']), ['a']);
});

test('only the latest taps are kept', () => {
  let seen: string[] = [];
  for (let i = 0; i < REMEMBERED_TAPS + 5; i++) seen = rememberTap(`m${i}`, seen)!;
  assert.equal(seen.length, REMEMBERED_TAPS);
  assert.equal(seen[0], 'm5');
  assert.equal(seen[seen.length - 1], `m${REMEMBERED_TAPS + 4}`);
  // Forgotten taps are old enough that acting on them again is harmless.
  assert.deepEqual(rememberTap('m0', seen)?.slice(-1), ['m0']);
});

test('the id comes from the notification, or from the FCM message id in its data', () => {
  assert.equal(tapId({ id: 'abc' }), 'abc');
  assert.equal(tapId({ data: { 'google.message_id': '0:123' } }), '0:123');
  assert.equal(tapId({ data: { url: '/x' } }), '');
  assert.equal(tapId(null), '');
});
