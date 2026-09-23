import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffImageType } from '../lib/media/sniff';

const bytes = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);

test('raster formats are recognised by their magic bytes', () => {
  assert.equal(sniffImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)), 'image/png');
  assert.equal(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0x00)), 'image/jpeg');
  assert.equal(sniffImageType(text('GIF89a....')), 'image/gif');
  assert.equal(sniffImageType(text('RIFF....WEBPVP8 ')), 'image/webp');
});

test('an svg is recognised as text, with or without the xml prologue or a BOM', () => {
  assert.equal(sniffImageType(text('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>')), 'image/svg+xml');
  assert.equal(sniffImageType(text('  <svg viewBox="0 0 1 1"></svg>')), 'image/svg+xml');
  assert.equal(sniffImageType(text('﻿<!-- icon -->\n<svg></svg>')), 'image/svg+xml');
});

test('anything else is unknown rather than guessed', () => {
  assert.equal(sniffImageType(text('%PDF-1.7')), null);
  assert.equal(sniffImageType(bytes(0x00, 0x01)), null);
  assert.equal(sniffImageType(text('<html><body>not an image</body></html>')), null);
});
