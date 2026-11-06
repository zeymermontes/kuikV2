import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripDevicePart, parseSpanishDate, parseSpanishTime, parsePartySize, parseCount, parseYesNo } from '../lib/whatsapp/parse';

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
  assert.equal(parseSpanishDate('el jueves de la otra semana quizá', TODAY), '2026-09-03'); // next week's Thursday
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

test('stripDevicePart keeps the user and the server and drops the device', () => {
  assert.equal(stripDevicePart('5215512345678:12@s.whatsapp.net'), '5215512345678@s.whatsapp.net');
  assert.equal(stripDevicePart('123456789012345:5@lid'), '123456789012345@lid');
  assert.equal(stripDevicePart('5215512345678@s.whatsapp.net'), '5215512345678@s.whatsapp.net');
  assert.equal(stripDevicePart('5215512345678'), '5215512345678');
});

// ── The ways people actually answer ────────────────────────────────────────

// A Friday.
const FRI = '2026-11-06';

test('days, the ways they get named', () => {
  for (const [input, expected] of [
    ['El dia sabado', '2026-11-07'], ['sabado 7', '2026-11-07'], ['el 15', '2026-11-15'], ['el día 15', '2026-11-15'],
    ['15', '2026-11-15'], ['7 nov', '2026-11-07'], ['7 de nov', '2026-11-07'], ['noviembre 7', '2026-11-07'],
    ['7/11', '2026-11-07'], ['07-11-26', '2026-11-07'], ['20 de diciembre de 2027', '2027-12-20'],
    ['el viernes de la otra semana', '2026-11-13'], ['el lunes de la próxima semana', '2026-11-09'],
    ['en ocho días', '2026-11-13'], ['en 3 dias', '2026-11-09'], ['el domingo día 8', '2026-11-08'],
    ['hoy en la noche', '2026-11-06'], ['mañana en la mañana', '2026-11-07'],
  ] as const) {
    assert.equal(parseSpanishDate(input, FRI), expected, `failed on ${input}`);
  }
});

test('"de la mañana" is a time of day, not tomorrow', () => {
  assert.equal(parseSpanishDate('el sábado a las 8 de la mañana', FRI), '2026-11-07');
  assert.equal(parseSpanishDate('el domingo a las 9 de la mañana', FRI), '2026-11-08');
});

test('a weekday and a number: the day of the month only when the two agree', () => {
  // The 8th is a Sunday, so "sábado 8" is Saturday at eight.
  assert.equal(parseSpanishDate('sábado 8', FRI), '2026-11-07');
  assert.equal(parseSpanishDate('sábado 8 pm', FRI), '2026-11-07');
  // Said outright as a day and still wrong: asked again, not guessed.
  assert.equal(parseSpanishDate('el sábado día 8', FRI), null);
});

test('dates that do not exist, and places that sound like months', () => {
  assert.equal(parseSpanishDate('31/02', FRI), null);
  assert.equal(parseSpanishDate('del mar 4 personas', FRI), null);
});

test('hours, the ways they get said', () => {
  for (const [input, expected] of [
    ['8pm', '20:00'], ['8 p.m.', '20:00'], ['8 PM', '20:00'], ['2 pm', '14:00'], ['8:30', '20:30'], ['08:30', '08:30'],
    ['8.30 pm', '20:30'], ['20 hrs', '20:00'], ['13:00 hrs', '13:00'], ['a las ocho', '20:00'], ['8 y media', '20:30'],
    ['a las 8 y 20', '20:20'], ['9 menos cuarto', '20:45'], ['cuarto para las 9', '20:45'], ['8 de la noche', '20:00'],
    ['8 de la mañana', '08:00'], ['1 de la tarde', '13:00'], ['a la 1', '13:00'], ['mediodía', '12:00'], ['12', '12:00'],
    ['12 de la noche', '00:00'], ['como a las 7', '19:00'], ['tipo 9', '21:00'], ['las 8', '20:00'],
    ['mañana a las 9 de la mañana', '09:00'],
  ] as const) {
    assert.equal(parseSpanishTime(input), expected, `failed on ${input}`);
  }
});

test('a number that is a date or a head count is not an hour', () => {
  assert.equal(parseSpanishTime('7 de noviembre'), null);
  assert.equal(parseSpanishTime('4 personas'), null);
  assert.equal(parseSpanishTime('12/09'), null);
});

test('counts, with a date and an hour in the same breath', () => {
  for (const [input, expected] of [
    ['13', 13], ['mañana a las 8 para 4', 4], ['el 7 de noviembre a las 8pm somos 10', 10], ['4 adultos y 2 niños', 6],
    ['una pareja', 2], ['mi esposa y yo', 2], ['solo yo', 1], ['unas 10 personas', 10], ['mesa para 2', 2], ['100', 100],
  ] as const) {
    assert.equal(parseCount(input), expected, `failed on ${input}`);
  }
  assert.equal(parseCount('a las 8'), null);
  assert.equal(parseCount('8pm'), null);
  assert.equal(parsePartySize('100'), null); // a table, not a banquet
});

test('strict reading: only what the text says outright', () => {
  // What a message carries about questions it was not asked.
  assert.equal(parseSpanishDate('somos 4 mañana a las 8', FRI, { strict: true }), '2026-11-07');
  assert.equal(parseSpanishTime('somos 4 mañana a las 8', { strict: true }), '20:00');
  assert.equal(parseCount('somos 4 mañana a las 8', { strict: true }), 4);
  assert.equal(parseSpanishTime('el 7 a las 8', { strict: true }), '20:00');
  // A bare number says nothing by itself.
  for (const bare of ['8', '13', 'ocho']) {
    assert.equal(parseSpanishDate(bare, FRI, { strict: true }), null);
    assert.equal(parseSpanishTime(bare, { strict: true }), null);
    assert.equal(parseCount(bare, { strict: true }), null);
  }
  assert.equal(parseSpanishTime('la 2', { strict: true }), null); // the second option, not two o'clock
  assert.equal(parseCount('Zeymer Montes', { strict: true }), null);
});

test('yes and no, the ways they get typed', () => {
  for (const yes of ['sí', 'Si', 'si por favor', 'simón', 'va', 'está bien', '👍', 'ok gracias', 'correcto', 'así es', 'es correcto, gracias', 'perfecto', 'claro que sí', 'ándale']) {
    assert.equal(parseYesNo(yes), 'yes', `failed on ${yes}`);
  }
  for (const no of ['no', 'nel', 'mejor no', 'no gracias', 'está mal', '👎']) {
    assert.equal(parseYesNo(no), 'no', `failed on ${no}`);
  }
  // Neither: asked again rather than assumed.
  for (const neither of ['hola', 'sí pero cambia la hora', 'mmm', 'a las 9 mejor']) {
    assert.equal(parseYesNo(neither), null, `failed on ${neither}`);
  }
});
