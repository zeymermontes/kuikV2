import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceBranchId, registerScope, sameBranch } from '../lib/pos/branch';

test('outside a browser the device has no branch', () => {
  assert.equal(deviceBranchId(), null);
});

test('null and undefined both mean the main location', () => {
  assert.equal(sameBranch(null, undefined), true);
  assert.equal(sameBranch('a', 'a'), true);
  assert.equal(sameBranch('a', null), false);
});

test('a customer screen follows the register within its branch', () => {
  assert.equal(registerScope('caja-1', null), 'caja-1');
  assert.equal(registerScope('caja-1', { slug: 'centro' }), 'centro--caja-1');
});
