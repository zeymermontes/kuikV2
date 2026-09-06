import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatQty, lowStock, portionsLeft, purchaseTotal, recipeCost } from '../lib/inventory';

const ings = [
  { id: 'a', name: 'Carne', unit: 'g', stock: 1500, min_stock: 500, cost_per_unit: 0.25, active: true },
  { id: 'b', name: 'Pan', unit: 'pza', stock: 8, min_stock: 10, cost_per_unit: 4, active: true },
  { id: 'c', name: 'Queso', unit: 'g', stock: 0, min_stock: null, cost_per_unit: 0.3, active: true },
];
const recipe = [
  { product_id: 'p', tenant_id: 't', ingredient_id: 'a', qty: 150 },
  { product_id: 'p', tenant_id: 't', ingredient_id: 'b', qty: 1 },
];

describe('inventory arithmetic', () => {
  it('costs a recipe from last costs', () => {
    assert.equal(recipeCost(recipe, ings), 41.5);
  });
  it('flags what is at or under its minimum', () => {
    assert.deepEqual(lowStock(ings).map((i) => i.id), ['b']);
  });
  it('portions left is the tightest ingredient', () => {
    assert.equal(portionsLeft(recipe, ings), 8);
    assert.equal(portionsLeft([], ings), null);
  });
  it('purchase totals and quantity formatting', () => {
    assert.equal(purchaseTotal([{ qty: 2, cost: 4.5 }, { qty: 1.5, cost: 100 }]), 159);
    assert.equal(formatQty(250, 'g'), '250 g');
    assert.equal(formatQty(1.5, 'kg'), '1.5 kg');
    assert.equal(formatQty(0.125, 'l'), '0.125 l');
  });
});
