import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bareTitle, titleWithCount } from '../lib/tab-title';

test('a count goes in front of the title, and nothing when there is none', () => {
  assert.equal(titleWithCount('Kuik', 3), '(3) Kuik');
  assert.equal(titleWithCount('Kuik — Chats', 1), '(1) Kuik — Chats');
  assert.equal(titleWithCount('Kuik', 0), 'Kuik');
  assert.equal(titleWithCount('Kuik', -2), 'Kuik');
  assert.equal(titleWithCount('Kuik', Number.NaN), 'Kuik');
});

test('a count already there is replaced, never stacked', () => {
  assert.equal(titleWithCount('(3) Kuik', 5), '(5) Kuik');
  assert.equal(titleWithCount('(3) Kuik', 0), 'Kuik');
  assert.equal(titleWithCount('(99+) Kuik', 2), '(2) Kuik');
  assert.equal(titleWithCount(titleWithCount('Kuik', 4), 4), '(4) Kuik');
});

test('past ninety-nine it stops counting', () => {
  assert.equal(titleWithCount('Kuik', 100), '(99+) Kuik');
  assert.equal(bareTitle('(99+) Kuik'), 'Kuik');
});

test('a title that merely starts with a parenthesis is left alone', () => {
  assert.equal(bareTitle('(beta) Kuik'), '(beta) Kuik');
  assert.equal(titleWithCount('(beta) Kuik', 2), '(2) (beta) Kuik');
});
