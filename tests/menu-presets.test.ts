import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU_PRESETS, getPreset, presetSettings } from '../lib/menu-presets';
import { DEFAULT_MENU_SETTINGS, resolveItemLayout, resolveMenuSettings } from '../lib/menu-settings';
import { MENU_FONTS } from '../lib/config';

test('every preset only writes knobs the menu actually reads', () => {
  const known = new Set(Object.keys(DEFAULT_MENU_SETTINGS));
  for (const p of MENU_PRESETS) {
    const unknown = Object.keys(p.settings).filter((k) => !known.has(k));
    assert.deepEqual(unknown, [], `${p.id} writes settings nobody resolves`);
  }
});

test('every preset font is one the tenant layout will load', () => {
  const fonts = new Set<string>(MENU_FONTS);
  for (const p of MENU_PRESETS) {
    for (const key of ['font_family', 'font_category', 'font_product', 'font_price', 'font_description'] as const) {
      const f = p.theme[key];
      if (f) assert.ok(fonts.has(f), `${p.id}.${key} = ${f} is not in MENU_FONTS`);
    }
  }
});

test('preset ids are unique and never carry tenant-owned content', () => {
  assert.equal(new Set(MENU_PRESETS.map((p) => p.id)).size, MENU_PRESETS.length);
  for (const p of MENU_PRESETS) {
    const s = presetSettings(p) as Record<string, unknown>;
    for (const k of ['currency', 'showName', 'showSlogan']) assert.ok(!(k in s), `${p.id} overrides ${k}`);
  }
});

test('matcha resolves to two photo-less columns with the price on the button row', () => {
  const matcha = getPreset('matcha');
  assert.ok(matcha);
  const s = resolveMenuSettings(presetSettings(matcha));
  const layout = resolveItemLayout(s);
  assert.equal(layout.columns, 2);
  assert.equal(layout.image, 'none');
  assert.equal(layout.price, 'footer');
  assert.equal(layout.surface, true);
  assert.equal(s.cardDivider, true);
  assert.equal(matcha.theme.font_price, 'Space Mono');
});
