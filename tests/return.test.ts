import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onReturn } from '../lib/native/return';

function fakeDoc(state: 'visible' | 'hidden' = 'visible') {
  const listeners = new Set<() => void>();
  return {
    visibilityState: state as string,
    addEventListener(_t: 'visibilitychange', fn: () => void) { listeners.add(fn); },
    removeEventListener(_t: 'visibilitychange', fn: () => void) { listeners.delete(fn); },
    set(s: 'visible' | 'hidden') { this.visibilityState = s; for (const fn of listeners) fn(); },
    count: () => listeners.size,
  };
}

test('fires once per return from the background, not on mount nor on going hidden', () => {
  const doc = fakeDoc();
  let calls = 0;
  onReturn(() => calls++, doc);
  assert.equal(calls, 0);
  doc.set('hidden');
  assert.equal(calls, 0);
  doc.set('visible');
  assert.equal(calls, 1);
  doc.set('visible');
  assert.equal(calls, 1);
  doc.set('hidden');
  doc.set('visible');
  assert.equal(calls, 2);
});

test('a page that mounts hidden fires when it is first shown', () => {
  const doc = fakeDoc('hidden');
  let calls = 0;
  onReturn(() => calls++, doc);
  doc.set('visible');
  assert.equal(calls, 1);
});

test('unsubscribing stops it; without a document it is a no-op', () => {
  const doc = fakeDoc();
  let calls = 0;
  const off = onReturn(() => calls++, doc);
  off();
  assert.equal(doc.count(), 0);
  doc.set('hidden');
  doc.set('visible');
  assert.equal(calls, 0);
  assert.doesNotThrow(() => onReturn(() => {}, undefined)());
});
