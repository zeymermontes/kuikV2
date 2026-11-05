import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRecent, needsRefresh } from '../lib/native/arrival';

test('an arrival note counts for a few seconds and no longer', () => {
  const now = 1_700_000_000_000;
  assert.ok(isRecent(String(now - 200), now));
  assert.ok(isRecent(String(now - 14_000), now));
  assert.equal(isRecent(String(now - 16_000), now), false);
});

test('a note that is not a time, or is from the future, does not count', () => {
  const now = 1_700_000_000_000;
  assert.equal(isRecent('', now), false);
  assert.equal(isRecent('abc', now), false);
  assert.equal(isRecent('0', now), false);
  assert.equal(isRecent(String(now + 5_000), now), false);
});

test('a page prefetched seconds ago is not fetched again; an older one is', () => {
  const now = 1_700_000_000_000;
  assert.equal(needsRefresh(now - 3_000, now), false);
  assert.equal(needsRefresh(now - 14_000, now), false);
  assert.ok(needsRefresh(now - 16_000, now));
  assert.ok(needsRefresh(now - 4 * 60_000, now));
});
