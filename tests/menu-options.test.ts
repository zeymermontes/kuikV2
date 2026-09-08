import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasRepeatedGroups, mergeOptionGroups, moveGroupByName } from '../lib/menu-options';
import type { OptionGroup } from '../lib/database.types';

const g = (id: string, name: string, first = 'a'): OptionGroup => ({ id, name, required: false, multiple: true, options: [{ name: first, price: 0 }] });
let n = 0;
const newId = () => `new-${++n}`;

test('a repeated group is detected by name, ignoring case and spaces', () => {
  assert.equal(hasRepeatedGroups([g('1', 'Extras')], [g('x', ' extras ')]), true);
  assert.equal(hasRepeatedGroups([g('1', 'Extras')], [g('x', 'Salsas')]), false);
});

test('overwrite replaces the group of the same name in place and appends the rest', () => {
  const out = mergeOptionGroups([g('1', 'Tamaño'), g('2', 'Extras', 'old')], [g('x', 'extras', 'new'), g('y', 'Salsas')], 'overwrite', newId);
  assert.deepEqual(out.map((x) => x.name), ['Tamaño', 'extras', 'Salsas']);
  assert.equal(out[1].options[0].name, 'new');
  assert.ok(out[1].id.startsWith('new-'), 'pasted groups get fresh ids');
});

test('duplicate keeps both, and never reuses the source ids', () => {
  const out = mergeOptionGroups([g('1', 'Extras')], [g('1', 'Extras')], 'duplicate', newId);
  assert.equal(out.length, 2);
  assert.notEqual(out[0].id, out[1].id);
});

test('a group moves to the front or the back by name; products without it are left as they are', () => {
  const groups = [g('1', 'Extras'), g('2', 'Tamaño'), g('3', 'Salsas')];
  assert.deepEqual(moveGroupByName(groups, 'tamaño', 'first').map((x) => x.name), ['Tamaño', 'Extras', 'Salsas']);
  assert.deepEqual(moveGroupByName(groups, 'Extras', 'last').map((x) => x.name), ['Tamaño', 'Salsas', 'Extras']);
  assert.equal(moveGroupByName(groups, 'Leche', 'first'), groups);
});
