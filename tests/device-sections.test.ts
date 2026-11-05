import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_SECTIONS, cleanSections, effectiveSections, roleForSections, sectionsOfRole, type DeviceSection } from '../lib/devices/sections';

test('whatever arrives is reduced to real sections, once each, in the offered order', () => {
  assert.deepEqual(cleanSections(['kds', 'host', 'kds', 'admin', 3, null]), ['host', 'kds']);
  assert.deepEqual(cleanSections('host'), []);
  assert.deepEqual(cleanSections(undefined), []);
  assert.deepEqual(cleanSections([]), []);
});

test('the role is the smallest one that covers the sections', () => {
  assert.equal(roleForSections(['host']), 'host');
  assert.equal(roleForSections(['chats']), 'host');
  assert.equal(roleForSections(['host', 'chats']), 'host');
  assert.equal(roleForSections(['kds']), 'waiter');
  assert.equal(roleForSections(['host', 'orders']), 'waiter');
  assert.equal(roleForSections(['pos', 'kds', 'orders', 'host']), 'waiter');
  assert.equal(roleForSections(['host', 'chats', 'orders']), 'cashier');
  assert.equal(roleForSections(['chats', 'kds']), 'cashier');
});

test('the derived role always covers every section asked for', () => {
  // All 31 non-empty subsets.
  for (let mask = 1; mask < 1 << DEVICE_SECTIONS.length; mask++) {
    const picked = DEVICE_SECTIONS.filter((_, i) => mask & (1 << i));
    const covers = sectionsOfRole(roleForSections(picked));
    for (const s of picked) assert.equal(covers.includes(s), true, `${picked.join(',')} → ${s}`);
    // And the device is then held to exactly what was picked.
    assert.deepEqual(effectiveSections({ role: roleForSections(picked), sections: picked }), picked);
  }
});

test('a device given no sections in particular opens all of its role', () => {
  assert.deepEqual(effectiveSections({ role: 'host', sections: null }), ['host', 'chats']);
  assert.deepEqual(effectiveSections({ role: 'host' }), ['host', 'chats']);
  assert.deepEqual(effectiveSections({ role: 'waiter', sections: null }), ['host', 'orders', 'pos', 'kds']);
  assert.deepEqual(effectiveSections({ role: 'cashier', sections: undefined }), DEVICE_SECTIONS);
});

test('sections never widen what the role covers', () => {
  assert.deepEqual(effectiveSections({ role: 'host', sections: ['host', 'pos', 'orders'] }), ['host']);
  assert.deepEqual(effectiveSections({ role: 'waiter', sections: ['chats'] }), []);
  assert.deepEqual(effectiveSections({ role: 'cashier', sections: ['admin', 'kds'] as unknown as DeviceSection[] }), ['kds']);
});

test('an empty list is no access, not all access', () => {
  assert.deepEqual(effectiveSections({ role: 'cashier', sections: [] }), []);
});
