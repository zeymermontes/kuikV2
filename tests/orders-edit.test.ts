import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lineTotal, retotal, unitPrice } from '../lib/orders/edit';

const burger = { name: 'Burger', basePrice: 100, qty: 2, selections: [{ name: 'Extra queso', price: 15 }] };
const fries = { name: 'Papas', basePrice: 40, qty: 1 };

test('a unit is the product plus its options; a line multiplies by quantity', () => {
  assert.equal(unitPrice(burger), 115);
  assert.equal(lineTotal(burger), 230);
});

test('an edit keeps what the old total carried beyond the lines (delivery, tip, discount)', () => {
  // Old: 230 + 40 = 270 in lines, total 300 (a 30 delivery fee).
  assert.equal(retotal(300, [burger, fries], [burger]), 260);
  // Without an old total there is nothing to carry.
  assert.equal(retotal(null, [burger, fries], [fries]), 40);
  // A discount larger than the new lines never goes negative.
  assert.equal(retotal(200, [burger, fries], [{ ...fries, qty: 1 }]), 0);
});
