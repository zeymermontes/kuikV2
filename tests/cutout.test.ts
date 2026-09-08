import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySensitivity } from '../lib/media/cutout';
import { maskFromOutput, preprocess } from '../lib/media/segment';

test('sensitivity 0 leaves alpha alone; higher cuts faint pixels and firms the rest', () => {
  const px = () => new Uint8ClampedArray([0, 0, 0, 20, 0, 0, 0, 128, 0, 0, 0, 255]);
  const a = px();
  applySensitivity(a, 0);
  assert.deepEqual([a[3], a[7], a[11]], [20, 128, 255]);
  const b = px();
  applySensitivity(b, 0.5);
  assert.equal(b[3], 0, 'faint pixel is gone');
  assert.ok(b[7] > 0 && b[7] < 255, 'mid pixel is stretched');
  assert.equal(b[11], 255);
  const c = px();
  applySensitivity(c, 1);
  assert.deepEqual([c[3], c[7], c[11]], [0, 0, 255], 'a hard mask at the top');
});

test('preprocess lays out RGB planes with the ImageNet mean removed', () => {
  // A 2×2 image: one red pixel, the rest black.
  const rgba = new Uint8ClampedArray(16);
  rgba[0] = 255;
  rgba[3] = 255;
  const out = preprocess(rgba, 2);
  assert.equal(out.length, 12);
  assert.ok(Math.abs(out[0] - (1 - 0.485)) < 1e-6, 'red plane, red pixel');
  assert.ok(Math.abs(out[1] - -0.485) < 1e-6, 'red plane, black pixel');
  assert.ok(Math.abs(out[4] - -0.456) < 1e-6, 'green plane');
});

test('the mask stretches the model output from min to max into alpha', () => {
  const mask = maskFromOutput(new Float32Array([0.2, 0.6, 1.0, 0.2]), 2);
  assert.deepEqual([mask[3], mask[7], mask[11], mask[15]], [0, 128, 255, 0]);
});
