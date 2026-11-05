import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chatTone, chatsFor, isStaffReply } from '../lib/chats/list';

const row = (id: string, lastAt: string, waiting = false) => ({ id, waiting, lastAt });

const rows = [
  // As the server sends them: the waiting ones first.
  row('w-new', '2026-11-05T11:30:00Z', true),
  row('w-old', '2026-11-05T10:00:00Z', true),
  row('a', '2026-11-05T12:00:00Z'),
  row('b', '2026-11-05T08:00:00Z'),
  row('c', '2026-11-05T11:45:00Z'),
];

test('recent lists everybody by last message, newest first, waiting or not', () => {
  assert.deepEqual(chatsFor(rows, 'all').map((r) => r.id), ['a', 'c', 'w-new', 'w-old', 'b']);
});

test('waiting lists only those, newest message first', () => {
  assert.deepEqual(chatsFor(rows, 'waiting').map((r) => r.id), ['w-new', 'w-old']);
});

test('recent no longer opens on the waiting chats when others wrote later', () => {
  assert.notEqual(chatsFor(rows, 'all')[0].id, chatsFor(rows, 'waiting')[0].id);
});

test('the list it is given is left as it was', () => {
  const before = rows.map((r) => r.id);
  chatsFor(rows, 'all');
  chatsFor(rows, 'waiting');
  assert.deepEqual(rows.map((r) => r.id), before);
});

test('a chat with no time sorts last, and nothing breaks', () => {
  const odd = [{ id: 'x', waiting: false, lastAt: null }, row('a', '2026-11-05T12:00:00Z')];
  assert.deepEqual(chatsFor(odd, 'all').map((r) => r.id), ['a', 'x']);
  assert.deepEqual(chatsFor([], 'waiting'), []);
});

test('only a person from the restaurant counts as having answered', () => {
  assert.equal(isStaffReply({ direction: 'outbound', origin: 'staff_dashboard' }), true);
  assert.equal(isStaffReply({ direction: 'outbound', origin: 'staff_device' }), true);
  // The bot saying somebody will come is not somebody coming.
  assert.equal(isStaffReply({ direction: 'outbound', origin: 'bot' }), false);
  assert.equal(isStaffReply({ direction: 'outbound', origin: 'system' }), false);
  assert.equal(isStaffReply({ direction: 'inbound', origin: 'customer' }), false);
});

test('a waiting chat is yellow until the restaurant answers, blue after, and yellow again when the diner writes', () => {
  assert.equal(chatTone({ waiting: true, staffReplied: false }), 'needsReply');
  assert.equal(chatTone({ waiting: true, staffReplied: true }), 'answered');
  // The diner wrote back: the last message is theirs, so nobody has answered it.
  assert.equal(chatTone({ waiting: true, staffReplied: false }), 'needsReply');
  // Not waiting for a person: quiet, whoever spoke last.
  assert.equal(chatTone({ waiting: false, staffReplied: true }), 'idle');
  assert.equal(chatTone({ waiting: false, staffReplied: false }), 'idle');
});
