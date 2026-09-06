import { test } from 'node:test';
import assert from 'node:assert/strict';
import Stripe from 'stripe';
import { priceOrder, applicationFee } from '../lib/payments/pricing';
import { translate, toMinor, fromMinor } from '../lib/payments/stripe';
import type { CartLine } from '../lib/whatsapp';

const line = (productId: string, qty: number, extra?: number, basePrice = 999): CartLine => ({
  key: productId,
  productId,
  name: `Item ${productId}`,
  basePrice, // the cart's number: must never be what gets charged
  qty,
  selections: extra != null ? [{ group: 'g', name: 'extra', price: extra } as unknown as CartLine['selections'][number]] : [],
});

test('the charge follows the menu price, not the cart, and floors negative extras', () => {
  const prices: Record<string, number> = { a: 100, b: 50 };
  const out = priceOrder([line('a', 2, 15), line('b', 1, -40)], (id) => prices[id] ?? null, { delivery: false });
  assert.ok(out);
  assert.deepEqual(out.lines.map((l) => l.unitAmount), [115, 50]);
  assert.equal(out.subtotal, 280);
  assert.equal(out.total, 280);
});

test('an unknown or unavailable product makes the order unpayable online', () => {
  assert.equal(priceOrder([line('zzz', 1)], () => null, { delivery: false }), null);
});

test('delivery fee, free-delivery threshold and tip percentage', () => {
  const priceOf = () => 100;
  const paid = priceOrder([line('a', 1)], priceOf, { delivery: true, deliveryFee: 35, freeDeliveryOver: 200, tipPercent: 10 });
  assert.equal(paid?.deliveryFee, 35);
  assert.equal(paid?.tip, 10);
  assert.equal(paid?.total, 145);
  const free = priceOrder([line('a', 3)], priceOf, { delivery: true, deliveryFee: 35, freeDeliveryOver: 200 });
  assert.equal(free?.deliveryFee, 0);
  assert.equal(free?.total, 300);
  // A tip the cart claims is 400% is clamped.
  const capped = priceOrder([line('a', 1)], priceOf, { delivery: false, tipPercent: 400 });
  assert.equal(capped?.tip, 50);
});

test('the platform fee is a clamped percentage rounded to cents', () => {
  assert.equal(applicationFee(494.5, 2.5), 12.36);
  assert.equal(applicationFee(100, 0), 0);
  assert.equal(applicationFee(100, 99), 30);
});

test('minor units round-trip for two-decimal and zero-decimal currencies', () => {
  assert.equal(toMinor(494.5, 'MXN'), 49450);
  assert.equal(fromMinor(49450, 'mxn'), 494.5);
  assert.equal(toMinor(1200, 'JPY'), 1200);
});

const session = (over: Partial<Stripe.Checkout.Session>): Stripe.Checkout.Session =>
  ({ id: 'cs_1', object: 'checkout.session', payment_status: 'paid', amount_total: 49450, currency: 'mxn', metadata: { order_id: 'ord-1' }, ...over }) as Stripe.Checkout.Session;
const ev = (type: string, object: unknown): Stripe.Event => ({ id: 'evt', type, data: { object } }) as unknown as Stripe.Event;

test('a completed, paid session becomes a paid event with the order id and amount', () => {
  const e = translate(ev('checkout.session.completed', session({})));
  assert.deepEqual(e, { type: 'paid', ref: 'cs_1', amount: 494.5, currency: 'MXN', orderId: 'ord-1' });
});

test('a completed session that is still unpaid (OXXO voucher printed) is ignored until async success', () => {
  assert.equal(translate(ev('checkout.session.completed', session({ payment_status: 'unpaid' }))).type, 'ignored');
  assert.equal(translate(ev('checkout.session.async_payment_succeeded', session({}))).type, 'paid');
  assert.equal(translate(ev('checkout.session.async_payment_failed', session({ payment_status: 'unpaid' }))).type, 'failed');
});

test('an expired session never downgrades a paid one; account updates carry the flags', () => {
  assert.equal(translate(ev('checkout.session.expired', session({}))).type, 'ignored');
  assert.equal(translate(ev('checkout.session.expired', session({ payment_status: 'unpaid' }))).type, 'failed');
  const acct = translate(ev('account.updated', { id: 'acct_1', object: 'account', charges_enabled: true, details_submitted: false }));
  assert.deepEqual(acct, { type: 'account', accountId: 'acct_1' });
  assert.equal(translate(ev('payment_intent.created', {})).type, 'ignored');
});

test('webhook signatures are verified before anything is parsed', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  const { stripeGateway } = await import('../lib/payments/stripe');
  const payload = JSON.stringify(ev('checkout.session.completed', session({})));
  const req = (sig: string | null) => ({ rawBody: payload, headers: new Headers(sig ? { 'stripe-signature': sig } : {}), searchParams: new URLSearchParams() });
  const good = new Stripe('sk_test_x').webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });
  const parsed = await stripeGateway.parseWebhook(req(good));
  assert.equal(parsed.type, 'paid');
  const bad = new Stripe('sk_test_x').webhooks.generateTestHeaderString({ payload, secret: 'whsec_other' });
  await assert.rejects(stripeGateway.parseWebhook(req(bad)));
  await assert.rejects(stripeGateway.parseWebhook(req(null)));
});

import { normalizePhone, safeReturnPath } from '../lib/payments/return-path';

test('safeReturnPath accepts only plain paths on our host', () => {
  assert.equal(safeReturnPath('/'), '/');
  assert.equal(safeReturnPath('/menu'), '/menu');
  assert.equal(safeReturnPath('/b/centro/menu'), '/b/centro/menu');
  assert.equal(safeReturnPath('//evil.com'), '/');
  assert.equal(safeReturnPath('https://evil.com/'), '/');
  assert.equal(safeReturnPath('/menu?x=1'), '/');
  assert.equal(safeReturnPath('/menu/../x'), '/');
  assert.equal(safeReturnPath(undefined), '/');
  assert.equal(safeReturnPath(42), '/');
});

test('normalizePhone keeps 10–15 digits and an optional plus', () => {
  assert.equal(normalizePhone('55 1234 5678'), '5512345678');
  assert.equal(normalizePhone('+52 (55) 1234-5678'), '+525512345678');
  assert.equal(normalizePhone('12345'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(null), null);
});
