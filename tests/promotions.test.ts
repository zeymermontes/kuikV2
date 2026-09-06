import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyPromotions, hasCoupons, isPromotionLive, promotionAmount } from '../lib/promotions';
import type { Promotion } from '../lib/database.types';

const promo = (over: Partial<Promotion>): Promotion => ({
  id: 'p', tenant_id: 't', name: 'Promo', kind: 'percent', value: 10, scope: 'order', category_ids: [], product_ids: [], code: null,
  min_subtotal: null, days: [], start_time: null, end_time: null, starts_on: null, ends_on: null, channels: ['pos', 'menu'],
  stackable: false, active: true, position: 0, created_at: '', updated_at: '', ...over,
});
const lines = [
  { productId: 'a', categoryId: 'drinks', unitPrice: 50, qty: 3 },
  { productId: 'b', categoryId: 'food', unitPrice: 120, qty: 1 },
];
const tz = 'America/Mexico_City';
// A Friday at 18:30 in Mexico City.
const friday = new Date('2026-09-12T00:30:00Z');

describe('isPromotionLive', () => {
  it('honours days, hours and dates in the restaurant timezone', () => {
    assert.equal(isPromotionLive(promo({}), { now: friday, tz }), true);
    assert.equal(isPromotionLive(promo({ active: false }), { now: friday, tz }), false);
    assert.equal(isPromotionLive(promo({ days: [4] }), { now: friday, tz }), true);
    assert.equal(isPromotionLive(promo({ days: [0, 1] }), { now: friday, tz }), false);
    assert.equal(isPromotionLive(promo({ start_time: '17:00:00', end_time: '19:00:00' }), { now: friday, tz }), true);
    assert.equal(isPromotionLive(promo({ start_time: '19:00', end_time: '21:00' }), { now: friday, tz }), false);
    assert.equal(isPromotionLive(promo({ start_time: '22:00', end_time: '02:00' }), { now: new Date('2026-09-12T06:30:00Z'), tz }), true);
    assert.equal(isPromotionLive(promo({ starts_on: '2026-09-13' }), { now: friday, tz }), false);
    assert.equal(isPromotionLive(promo({ ends_on: '2026-09-11' }), { now: friday, tz }), true); // the last day counts
    assert.equal(isPromotionLive(promo({ ends_on: '2026-09-10' }), { now: friday, tz }), false);
  });
});

describe('promotionAmount', () => {
  it('percent and amount on the order or on matching lines', () => {
    assert.equal(promotionAmount(promo({ kind: 'percent', value: 10 }), lines, 270), 27);
    assert.equal(promotionAmount(promo({ kind: 'amount', value: 30 }), lines, 270), 30);
    assert.equal(promotionAmount(promo({ kind: 'percent', value: 50, scope: 'category', category_ids: ['drinks'] }), lines, 270), 75);
    assert.equal(promotionAmount(promo({ kind: 'amount', value: 500, scope: 'product', product_ids: ['b'] }), lines, 270), 120);
    assert.equal(promotionAmount(promo({ min_subtotal: 300 }), lines, 270), 0);
  });
  it('two for one frees every second unit, the cheaper one', () => {
    assert.equal(promotionAmount(promo({ kind: 'bogo', scope: 'category', category_ids: ['drinks'] }), lines, 270), 50);
    const mixed = [
      { productId: 'a', categoryId: 'drinks', unitPrice: 50, qty: 1 },
      { productId: 'c', categoryId: 'drinks', unitPrice: 80, qty: 1 },
    ];
    assert.equal(promotionAmount(promo({ kind: 'bogo', scope: 'category', category_ids: ['drinks'] }), mixed, 130), 50);
  });
});

describe('applyPromotions', () => {
  it('automatic ones apply, the best exclusive wins, stackable ones add', () => {
    const r = applyPromotions([promo({ id: 'x', value: 10 }), promo({ id: 'y', value: 20 }), promo({ id: 'z', kind: 'amount', value: 5, stackable: true })], lines, { channel: 'pos', now: friday, tz });
    assert.deepEqual(r.applied.map((a) => a.id), ['y', 'z']);
    assert.equal(r.discount, 59);
    assert.equal(r.badCode, false);
  });
  it('coupons need their code, and a wrong code is reported', () => {
    const promos = [promo({ id: 'c', code: 'HOLA10', value: 10 })];
    assert.equal(applyPromotions(promos, lines, { channel: 'menu', now: friday, tz }).discount, 0);
    assert.equal(applyPromotions(promos, lines, { channel: 'menu', code: 'hola10', now: friday, tz }).discount, 27);
    assert.equal(applyPromotions(promos, lines, { channel: 'menu', code: 'NOPE', now: friday, tz }).badCode, true);
    assert.equal(hasCoupons(promos, 'menu', { now: friday, tz }), true);
    assert.equal(hasCoupons(promos, 'pos', { now: friday, tz }), true);
  });
  it('respects the channel and never exceeds the subtotal', () => {
    assert.equal(applyPromotions([promo({ channels: ['menu'] })], lines, { channel: 'pos', now: friday, tz }).discount, 0);
    assert.equal(applyPromotions([promo({ kind: 'amount', value: 999 })], lines, { channel: 'pos', now: friday, tz }).discount, 270);
  });
});
