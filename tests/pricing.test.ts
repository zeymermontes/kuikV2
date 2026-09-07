import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchAmount, monthlyAmount, type PriceTable } from '../lib/pricing';

const prices: PriceTable = {
  plan_amount: 299,
  pro_amount: 499,
  extra_amount: 299,
  pos_addon_amount: 499,
  branch_amount_basic: 250,
  branch_amount_pro: 499,
};

test('a branch costs 250 on Menú and 499 on Restaurante', () => {
  assert.equal(branchAmount(prices, 'basic'), 250);
  assert.equal(branchAmount(prices, 'pro'), 499);
});

test('the monthly charge adds the tier, the POS add-on and every branch', () => {
  assert.equal(monthlyAmount(prices, { plan: 'basic' }), 299);
  assert.equal(monthlyAmount(prices, { plan: 'basic', branches: 2 }), 799);
  assert.equal(monthlyAmount(prices, { plan: 'pro', addons: ['pos'], branches: 1 }), 1497);
  assert.equal(monthlyAmount(prices, { plan: 'pro', additional: true }), 299);
  assert.equal(monthlyAmount(prices, { plan: 'pro', branches: -3 }), 499);
});
