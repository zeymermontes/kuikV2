import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canUse, canUsePos, effectiveAddons, effectivePlan, feePercentFor } from '../lib/plan';

test('the point of sale is an add-on, not a tier', () => {
  assert.equal(canUse('pro', 'pos'), false);
  assert.equal(canUse('basic', 'pos', ['pos']), true);
  assert.equal(canUse('pro', 'wa_bots'), true);
  assert.equal(canUse('basic', 'wa_bots'), false);
  assert.equal(canUse('basic', 'loyalty', ['pos']), false);
});

test('the trial has everything; afterwards only what is paid', () => {
  assert.equal(effectivePlan({ status: 'trialing', plan: 'basic' }), 'pro');
  assert.deepEqual(effectiveAddons({ status: 'trialing', plan: 'basic', addons: [] }), ['pos']);
  assert.equal(canUsePos({ status: 'active', plan: 'pro', addons: [] }), false);
  assert.equal(canUsePos({ status: 'active', plan: 'basic', addons: ['pos', 'bogus'] }), true);
  assert.deepEqual(effectiveAddons({ status: 'active', plan: 'basic', addons: null }), []);
});

test('the higher tier may pay a lower online-payment fee', () => {
  assert.equal(feePercentFor({ payment_fee_percent: 3, pro_payment_fee_percent: null }, 'pro'), 3);
  assert.equal(feePercentFor({ payment_fee_percent: 3, pro_payment_fee_percent: 1.5 }, 'pro'), 1.5);
  assert.equal(feePercentFor({ payment_fee_percent: 3, pro_payment_fee_percent: 1.5 }, 'basic'), 3);
});
