import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderMessage, type CartLine } from '../lib/whatsapp';

const lines: CartLine[] = [{ key: 'a', productId: 'p1', name: 'Matcha latte', basePrice: 140, selections: [], qty: 1 }];

test('the payment line rides in the header block, before the items', () => {
  const msg = buildOrderMessage({
    restaurantName: 'Kavaa',
    lines,
    showPrices: true,
    serviceLabel: 'Para recoger',
    paymentLabel: 'Transferencia — envío comprobante por WhatsApp',
  });
  const i = msg.indexOf('Pago: Transferencia — envío comprobante por WhatsApp');
  assert.ok(i > 0);
  assert.ok(i < msg.indexOf('1× Matcha latte'));
});

test('no payment chosen → no Pago line at all', () => {
  const msg = buildOrderMessage({ restaurantName: 'Kavaa', lines, showPrices: true });
  assert.doesNotMatch(msg, /Pago:/);
});
