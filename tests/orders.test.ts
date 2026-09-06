import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ORDER_ALERTS, resolveOrderAlerts } from '../lib/orders/alerts';
import { onlineOrderDoc, renderText } from '../lib/pos/print-doc';
import { orderCode } from '../lib/utils';

test('resolveOrderAlerts fills defaults and clamps what it gets', () => {
  assert.deepEqual(resolveOrderAlerts(null), DEFAULT_ORDER_ALERTS);
  assert.deepEqual(resolveOrderAlerts({}), DEFAULT_ORDER_ALERTS);
  const a = resolveOrderAlerts({ push: false, escalateMinutes: 999, teamPhones: ['+52 55 1', '', 3, 'x', 'y', 'z', 'w', 'v'] });
  assert.equal(a.push, false);
  assert.equal(a.sound, true);
  assert.equal(a.escalateMinutes, 60);
  assert.deepEqual(a.teamPhones, ['+52 55 1', 'x', 'y', 'z', 'w']);
  assert.equal(resolveOrderAlerts({ escalateMinutes: 'soon' }).escalateMinutes, 3);
});

test('orderCode is the first six hex digits, upper-case', () => {
  assert.equal(orderCode('531fd83a-523f-434d-8e1f-d2b1402faba7'), '531FD8');
});

test('online order slip lays out who, what and paid', () => {
  const doc = onlineOrderDoc({
    code: '531FD8',
    restaurant: 'Hirata',
    customerName: 'zeymer',
    customerPhone: '5512345678',
    service: 'Comer aquí',
    table: 'Mesa 4',
    when: '06/09 03:13',
    items: [{ name: 'Margarita', qty: 1, selections: [{ name: 'Grande' }], note: 'sin albahaca' }],
    total: '$250.00',
    paidLabel: 'PAGADO EN LÍNEA',
    title: 'PEDIDO EN LÍNEA',
  });
  const out = renderText(doc, 32);
  assert.ok(out.some((l) => l.includes('#531FD8')));
  assert.ok(out.some((l) => l.startsWith('Cliente') && l.endsWith('zeymer')));
  assert.ok(out.some((l) => l.includes('Comer aquí · Mesa 4')));
  assert.ok(out.some((l) => l.includes('1x Margarita')));
  assert.ok(out.some((l) => l.includes('* sin albahaca')));
  assert.ok(out.some((l) => l.includes('$250.00')));
  assert.ok(out.some((l) => l.includes('PAGADO EN LÍNEA')));
  for (const l of out) assert.ok(l.length <= 32, l);
});
