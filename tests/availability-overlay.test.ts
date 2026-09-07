import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySoldOut, optionKey } from '../lib/availability/overlay';
import type { Product } from '../lib/database.types';

const product = (over: Partial<Product>): Product =>
  ({
    id: 'p',
    tenant_id: 't',
    category_id: 'c',
    name: 'Latte',
    price: 50,
    is_available: true,
    is_hidden: false,
    position: 0,
    tags: [],
    variants: [],
    modifiers: [],
    removables: [],
    option_groups: [{ id: 'g', name: 'Leche', required: true, multiple: false, options: [{ name: 'Entera', price: 0 }, { name: 'Leche de avena', price: 10 }] }],
    created_at: '',
    updated_at: '',
    ...over,
  }) as Product;

const menu = [product({ id: 'latte' }), product({ id: 'pan', name: 'Pan', option_groups: [] })];

test('only the location being shown is applied', () => {
  const rows = [
    { branch_id: 'centro', product_id: 'pan', option_key: null },
    { branch_id: null, product_id: 'latte', option_key: null },
  ];
  const centro = applySoldOut(menu, rows, 'centro');
  assert.equal(centro.find((p) => p.id === 'pan')!.is_available, false);
  assert.equal(centro.find((p) => p.id === 'latte')!.is_available, true);
  const main = applySoldOut(menu, rows, null);
  assert.equal(main.find((p) => p.id === 'pan')!.is_available, true);
  assert.equal(main.find((p) => p.id === 'latte')!.is_available, false);
});

test('an option out at a location is greyed in every product there', () => {
  const rows = [{ branch_id: 'centro', product_id: null, option_key: optionKey(' Leche de Avena ') }];
  const out = applySoldOut(menu, rows, 'centro');
  const opts = out[0].option_groups[0].options;
  assert.equal(opts[1].available, false);
  assert.equal(opts[0].available, undefined);
  assert.equal(out[0].is_available, true);
});

test('no rows for the location returns the products untouched', () => {
  assert.equal(applySoldOut(menu, [{ branch_id: 'otra', product_id: 'pan', option_key: null }], 'centro'), menu);
});
