import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, isVersion, updateKind } from '../lib/apps/version';

test('compareVersions orders dotted versions numerically', () => {
  assert.ok(compareVersions('0.1.1', '0.1.0') > 0);
  assert.ok(compareVersions('0.9', '0.10') < 0);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
});

test('isVersion accepts digits and dots only', () => {
  assert.ok(isVersion('0.1.1'));
  assert.ok(isVersion(' 2.0 '));
  assert.equal(isVersion('v1.0'), false);
  assert.equal(isVersion('1.0-beta'), false);
  assert.equal(isVersion(''), false);
});

test('up to date, or nothing to install here: none', () => {
  assert.equal(updateKind({ mine: '0.1.1', available: '0.1.1', minVersion: '0.1.1' }), 'none');
  assert.equal(updateKind({ mine: '0.1.0', available: null, minVersion: '0.1.1' }), 'none');
  assert.equal(updateKind({ mine: '0.2.0', available: '0.1.1', minVersion: null }), 'none');
});

test('newer build with no minimum, or a minimum already met: recommended', () => {
  assert.equal(updateKind({ mine: '0.1.0', available: '0.1.1', minVersion: null }), 'recommended');
  assert.equal(updateKind({ mine: '0.1.1', available: '0.1.2', minVersion: '0.1.1' }), 'recommended');
});

test('below the minimum and the update is installable: required', () => {
  assert.equal(updateKind({ mine: '0.1.0', available: '0.1.1', minVersion: '0.1.1' }), 'required');
  assert.equal(updateKind({ mine: '0.1.0', available: '0.1.3', minVersion: '0.1.1' }), 'required');
});

test('a store that is still behind the minimum only recommends', () => {
  // The App Store has 0.1.1 but the feed already demands 0.1.2: keep working.
  assert.equal(updateKind({ mine: '0.1.0', available: '0.1.1', minVersion: '0.1.2' }), 'recommended');
});
