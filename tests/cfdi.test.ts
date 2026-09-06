import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildConcepts, globalPeriod } from '../lib/cfdi/build';
import { normalizeRfc, isValidZip } from '../lib/cfdi/catalogs';

describe('buildConcepts', () => {
  it('splits IVA out of inclusive prices and adds up to what was paid', () => {
    const r = buildConcepts([{ name: 'Latte', qty: 2, unitPrice: 58 }, { name: 'Bagel', qty: 1, unitPrice: 116 }], { ivaPercent: 16, productCode: '90101500', unitCode: 'E48' });
    assert.equal(r.total, 232);
    assert.equal(r.subtotal, 200);
    assert.equal(r.tax, 32);
    assert.equal(r.concepts[0].unitPrice, 50);
    assert.equal(r.concepts[0].taxRate, 0.16);
    assert.equal(r.concepts[0].productCode, '90101500');
  });
  it('spreads a discount before splitting, so the invoice matches the discounted total', () => {
    const r = buildConcepts([{ name: 'A', qty: 1, unitPrice: 100 }, { name: 'B', qty: 1, unitPrice: 100 }], { ivaPercent: 16, discount: 20, productCode: 'x', unitCode: 'y' });
    assert.equal(r.total, 180);
    assert.equal(r.concepts[0].total, 90);
  });
  it('zero IVA means exempt concepts and per-line SAT codes win', () => {
    const r = buildConcepts([{ name: 'Cerveza', qty: 1, unitPrice: 50, productCode: '50202201', unitCode: 'H87' }], { ivaPercent: 0, productCode: 'd', unitCode: 'e' });
    assert.equal(r.concepts[0].taxRate, null);
    assert.equal(r.tax, 0);
    assert.equal(r.concepts[0].productCode, '50202201');
    assert.equal(r.concepts[0].unitCode, 'H87');
  });
  it('skips free or empty lines', () => {
    assert.equal(buildConcepts([{ name: 'Agua', qty: 1, unitPrice: 0 }], { ivaPercent: 16, productCode: 'a', unitCode: 'b' }).concepts.length, 0);
  });
});

describe('catalogs', () => {
  it('normalises RFCs and zips', () => {
    assert.equal(normalizeRfc(' xaxx010101000 '), 'XAXX010101000');
    assert.equal(normalizeRfc('ABC-850101-AB1'), 'ABC850101AB1');
    assert.equal(normalizeRfc('nope'), null);
    assert.equal(isValidZip('44100'), true);
    assert.equal(isValidZip('441'), false);
  });
  it('global period for a day', () => {
    assert.deepEqual(globalPeriod('2026-09-06'), { periodicity: '01', months: '09', year: 2026 });
  });
});
