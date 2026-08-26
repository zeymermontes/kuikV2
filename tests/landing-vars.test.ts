import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LANDING_VARIABLES } from '../lib/landing-variables';
import { applyLandingVars, isSubstitutable } from '../lib/landing-vars';

test('every documented variable is actually resolved', () => {
  // The catalogue is what the AI brief and the dashboard table promise; the
  // resolver is what delivers. A key in one and not the other renders as
  // literal {{braces}} on a real restaurant's site.
  const resolver = readFileSync(new URL('../lib/landing-vars.ts', import.meta.url), 'utf8');
  const returned = resolver.slice(resolver.indexOf('return {'), resolver.indexOf('});', resolver.indexOf('return {')));
  const missing = LANDING_VARIABLES.filter((v) => !new RegExp(`\\b${v.key}\\s*:`).test(returned));
  assert.deepEqual(missing.map((v) => v.key), [], 'documented but never resolved');
});

test('substitutes known variables', () => {
  const out = applyLandingVars('<h1>{{nombre}}</h1><p>{{telefono}}</p>', {
    nombre: 'Mar and Sea', telefono: '526671540726',
  });
  assert.equal(out, '<h1>Mar and Sea</h1><p>526671540726</p>');
});

test('tolerates spaces inside the braces', () => {
  assert.equal(applyLandingVars('{{ nombre }}', { nombre: 'X' }), 'X');
});

test('leaves an unknown variable alone rather than blanking it', () => {
  // A landing may carry braces belonging to its own template engine; eating
  // them silently would be worse than leaving them visible.
  assert.equal(applyLandingVars('{{otro_motor}}', { nombre: 'X' }), '{{otro_motor}}');
});

test('an empty value substitutes to empty, not to the placeholder', () => {
  assert.equal(applyLandingVars('a{{vacio}}b', { vacio: '' }), 'ab');
});

test('only text files get rewritten', () => {
  for (const f of ['index.html', 'app.css', 'main.js', 'data.json', 'icon.svg']) {
    assert.ok(isSubstitutable(f), `${f} should be substitutable`);
  }
  for (const f of ['photo.jpg', 'logo.png', 'font.woff2', 'clip.mp4']) {
    assert.ok(!isSubstitutable(f), `${f} must stream through untouched`);
  }
});
