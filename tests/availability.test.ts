import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optionCatalog, patchOptionAvailability, patchProductAvailability, soldOutCount } from '../lib/pos/availability';
import type { PosMenu } from '../lib/pos/types';
import type { Product } from '../lib/database.types';

function product(over: Partial<Product>): Product {
  return {
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
    option_groups: [],
    created_at: '',
    updated_at: '',
    ...over,
  } as Product;
}

const menu: PosMenu = {
  categories: [{ id: 'c', name: 'Bebidas' } as PosMenu['categories'][number]],
  products: [
    product({
      id: 'latte',
      name: 'Latte',
      option_groups: [{ id: 'g', name: 'Leche', required: true, multiple: false, options: [{ name: 'Entera', price: 0 }, { name: 'Leche de avena', price: 10 }] }],
    }),
    product({ id: 'matcha', name: 'Matcha', modifiers: [{ name: 'leche de avena', price: 10, available: false }] }),
    product({ id: 'pan', name: 'Pan', is_available: false }),
  ],
};

test('a product is marked and unmarked without touching the others', () => {
  const out = patchProductAvailability(menu, 'latte', false);
  assert.equal(out.products.find((p) => p.id === 'latte')!.is_available, false);
  assert.equal(out.products.find((p) => p.id === 'matcha')!.is_available, true);
  assert.equal(patchProductAvailability(out, 'latte', true).products[0].is_available, true);
});

test('an option is marked by name in every product, case-insensitively', () => {
  const out = patchOptionAvailability(menu, 'Leche de Avena', false);
  const latte = out.products.find((p) => p.id === 'latte')!;
  assert.equal(latte.option_groups[0].options[1].available, false);
  assert.equal(latte.option_groups[0].options[0].available, undefined);
  const back = patchOptionAvailability(out, 'leche de avena', true);
  assert.equal(back.products.find((p) => p.id === 'matcha')!.modifiers[0].available, true);
});

test('the option catalogue lists each name once, sold-out first, counting products', () => {
  const cat = optionCatalog(menu);
  assert.deepEqual(
    cat.map((o) => [o.name, o.available, o.products]),
    [
      ['Leche de avena', false, 2],
      ['Entera', true, 1],
    ],
  );
});

test('the sold-out count adds products and options', () => {
  assert.equal(soldOutCount(menu), 2);
  assert.equal(soldOutCount(patchOptionAvailability(menu, 'leche de avena', true)), 1);
});
