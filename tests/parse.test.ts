import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSpanishDate, parseSpanishTime, parsePartySize } from '../lib/whatsapp/parse';

// A Tuesday, so weekday maths is visible.
const TODAY = '2026-08-25';

test('relative days', () => {
  assert.equal(parseSpanishDate('hoy', TODAY), '2026-08-25');
  assert.equal(parseSpanishDate('mañana', TODAY), '2026-08-26');
  assert.equal(parseSpanishDate('pasado mañana', TODAY), '2026-08-27');
  assert.equal(parseSpanishDate('MAÑANA porfa', TODAY), '2026-08-26');
});

test('weekday names resolve forward', () => {
  assert.equal(parseSpanishDate('el viernes', TODAY), '2026-08-28');
  assert.equal(parseSpanishDate('sabado', TODAY), '2026-08-29');
  assert.equal(parseSpanishDate('el martes', TODAY), '2026-08-25'); // today is Tuesday
});

test('written and numeric dates', () => {
  assert.equal(parseSpanishDate('12 de septiembre', TODAY), '2026-09-12');
  assert.equal(parseSpanishDate('12/09', TODAY), '2026-09-12');
  assert.equal(parseSpanishDate('12-09-2027', TODAY), '2027-09-12');
});

test('a date already past rolls to next year', () => {
  assert.equal(parseSpanishDate('3 de enero', TODAY), '2027-01-03');
});

test('times, including how people actually type them', () => {
  for (const [input, expected] of [
    ['20:30', '20:30'], ['8pm', '20:00'], ['8 pm', '20:00'],
    ['a las 8', '20:00'], ['8:30 pm', '20:30'], ['ocho y media', '20:30'],
    ['ocho y cuarto', '20:15'], ['21', '21:00'],
  ] as const) {
    assert.equal(parseSpanishTime(input), expected, `failed on ${input}`);
  }
});

test('"a las 8" for a dinner table means 20:00, not breakfast', () => {
  assert.equal(parseSpanishTime('8'), '20:00');
});

test('party size in digits and words', () => {
  assert.equal(parsePartySize('4'), 4);
  assert.equal(parsePartySize('somos 6'), 6);
  assert.equal(parsePartySize('para cuatro personas'), 4);
  assert.equal(parsePartySize('doce'), 12);
});

test('nonsense returns null so the bot re-asks instead of guessing', () => {
  assert.equal(parseSpanishDate('el jueves de la otra semana quizá', TODAY), '2026-08-27'); // finds "jueves"
  assert.equal(parseSpanishDate('cuando puedas', TODAY), null);
  assert.equal(parseSpanishTime('cuando sea'), null);
  assert.equal(parsePartySize('muchos'), null);
});

test('listOptionNames merges the same option across products and flags it when out anywhere', async () => {
  const { listOptionNames, optionAvailable } = await import('../lib/menu-options');
  const base = { id: '', tenant_id: '', category_id: '', description: null, price: 1, compare_at_price: null, cost: null, sku: null, prep_time: null, calories: null, show_price: true, image_url: null, is_available: true, is_hidden: false, position: 0, tags: [], variants: [], modifiers: [], removables: [], created_at: '', updated_at: '' };
  const g = (opts: { name: string; price: number; available?: boolean }[]) => [{ id: 'g', name: 'Leche', required: false, multiple: false, options: opts }];
  const products = [
    { ...base, id: 'a', name: 'Latte', option_groups: g([{ name: 'Leche de avena', price: 15 }, { name: 'Entera', price: 0 }]) },
    { ...base, id: 'b', name: 'Capuchino', option_groups: g([{ name: 'leche de avena', price: 15, available: false }]) },
  ];
  const names = listOptionNames(products);
  assert.deepEqual(names.map((n) => [n.name, n.count, n.available]), [['Leche de avena', 2, false], ['Entera', 1, true]]);
  assert.equal(optionAvailable({ name: 'x', price: 0 }), true);
  assert.equal(optionAvailable({ name: 'x', price: 0, available: false }), false);
});
