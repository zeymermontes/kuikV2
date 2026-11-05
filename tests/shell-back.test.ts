import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backAction } from '../lib/native/back';

test('on the hub, back leaves the app whatever the history holds', () => {
  assert.equal(backAction('/terminal', true), 'minimize');
  assert.equal(backAction('/terminal', false), 'minimize');
  assert.equal(backAction('/terminal/', true), 'minimize');
});

test('on a section home, back returns to the hub', () => {
  for (const p of ['/dashboard', '/pos', '/kds', '/host', '/chats', '/orders', '/dashboard/']) {
    assert.equal(backAction(p, true), 'hub', p);
  }
});

test('deeper in, back goes one page, and to the hub when nothing is behind', () => {
  assert.equal(backAction('/menu', true), 'back');
  assert.equal(backAction('/whatsapp/inbox', true), 'back');
  assert.equal(backAction('/menu', false), 'hub');
});
