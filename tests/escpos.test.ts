import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESC, GS, encodeCp1252, renderEscPos, row, splitPrinterAddress, wrap } from '../lib/pos/escpos';
import { renderText, type PrintDoc } from '../lib/pos/print-doc';

// These mirror print-agent/escpos_test.go: the Go agent and this renderer
// must produce the same layout for the same document.

test('row keeps the right column flush right', () => {
  const got = row('2x Latte', '$260.00', 32);
  assert.equal(got.length, 32);
  assert.ok(got.startsWith('2x Latte'));
  assert.ok(got.endsWith('$260.00'));
});

test('row trims a long left column, leaving a space', () => {
  const got = row('Matcha latte + foam + nieve de matcha extra grande', '$180.00', 32);
  assert.equal(got.length, 32);
  assert.ok(got.endsWith(' $180.00'));
});

test('wrap keeps words whole', () => {
  const lines = wrap('Si esto se lee completo, la impresora está lista.', 20);
  for (const l of lines) assert.ok(l.length <= 20, l);
  assert.ok(lines.length >= 3);
});

test('wrap hard-breaks a word longer than the line', () => {
  assert.deepEqual(wrap('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
});

test('encode maps accents to cp1252 and the rest to ?', () => {
  assert.deepEqual(Array.from(encodeCp1252('ñ€x☃')), [0xf1, 0x80, 0x78, 0x3f]);
});

test('render emits the expected commands', () => {
  const doc: PrintDoc = {
    title: 't',
    lines: [
      { t: 'text', v: 'Cocina', align: 'center', bold: true, size: 2 },
      { t: 'row', l: 'Mesa 4', r: '18:30' },
      { t: 'hr' },
    ],
    drawer: true,
  };
  const out = Array.from(renderEscPos(doc, 32, true));
  const has = (seq: number[]) => {
    for (let i = 0; i + seq.length <= out.length; i++) {
      if (seq.every((b, j) => out[i + j] === b)) return true;
    }
    return false;
  };
  assert.ok(has([ESC, 0x40]), 'init');
  assert.ok(has([ESC, 0x74, 16]), 'codepage');
  assert.ok(has([ESC, 0x61, 1]), 'center');
  assert.ok(has([ESC, 0x45, 1]), 'bold on');
  assert.ok(has([GS, 0x21, 0x11]), 'double size');
  assert.ok(has([ESC, 0x70, 0, 25, 250]), 'drawer');
  assert.ok(has([GS, 0x56, 66, 0]), 'cut');
  assert.ok(has(Array.from(Buffer.from('-'.repeat(32), 'latin1'))), 'rule');
});

test('render skips the cut when the document opts out', () => {
  const doc: PrintDoc = { title: 't', lines: [{ t: 'text', v: 'x' }], cut: false };
  const out = Array.from(renderEscPos(doc, 48, true));
  assert.equal(out.includes(0x56), false);
});

test('render lays text out like renderText', () => {
  const doc: PrintDoc = {
    title: 't',
    lines: [
      { t: 'row', l: 'Subtotal', r: '$120.00' },
      { t: 'text', v: 'Gracias por su visita, vuelva pronto' },
    ],
  };
  const bytes = renderEscPos(doc, 32, false);
  // Strip control sequences: everything printable between newlines is a line.
  const printable = Buffer.from(bytes)
    .toString('latin1')
    .replace(/\x1b@/g, '').replace(/\x1b[ta]./g, '')
    .replace(/\x1bE./g, '')
    .replace(/\x1d!./g, '');
  const lines = printable.split('\n').filter(Boolean);
  assert.deepEqual(lines, renderText(doc, 32));
});

test('printer address splits into host and port', () => {
  assert.deepEqual(splitPrinterAddress('192.168.1.50'), { host: '192.168.1.50', port: 9100 });
  assert.deepEqual(splitPrinterAddress(' 192.168.1.50:9101 '), { host: '192.168.1.50', port: 9101 });
  assert.equal(splitPrinterAddress(''), null);
  assert.equal(splitPrinterAddress('host:abc'), null);
});
