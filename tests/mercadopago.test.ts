import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

process.env.MERCADOPAGO_ACCESS_TOKEN ??= 'TEST-platform';
process.env.MERCADOPAGO_CLIENT_ID ??= '123';
process.env.MERCADOPAGO_CLIENT_SECRET ??= 'shh';
process.env.MERCADOPAGO_WEBHOOK_SIGNING_SECRET ??= 'mp_secret';

test('Mercado Pago payment statuses map to paid / failed / refunded / wait', async () => {
  const { translatePayment } = await import('../lib/payments/mercadopago');
  const paid = translatePayment({ id: 91, status: 'approved', external_reference: 'o-1', transaction_amount: 250, currency_id: 'MXN' });
  assert.deepEqual(paid, { type: 'paid', ref: '91', amount: 250, currency: 'MXN', orderId: 'o-1' });
  assert.equal(translatePayment({ id: 1, status: 'rejected', external_reference: 'o-2' }).type, 'failed');
  assert.equal(translatePayment({ id: 1, status: 'refunded', external_reference: 'o-2' }).type, 'refunded');
  assert.equal(translatePayment({ id: 1, status: 'pending' }).type, 'ignored');
  // metadata.order_id wins over external_reference when both exist
  const m = translatePayment({ id: 2, status: 'approved', external_reference: 'x', metadata: { order_id: 'o-3' } });
  assert.equal(m.type === 'paid' && m.orderId, 'o-3');
});

test('the OAuth state names the tenant and cannot be forged', async () => {
  const { oauthState, tenantFromState } = await import('../lib/payments/mercadopago');
  const state = oauthState('tenant-abc');
  assert.equal(tenantFromState(state), 'tenant-abc');
  assert.equal(tenantFromState('tenant-abc.00000000000000000000000000000000'), null);
  assert.equal(tenantFromState('tenant-xyz.' + state.split('.')[1]), null);
  assert.equal(tenantFromState(null), null);
  assert.equal(tenantFromState('nodot'), null);
});

test('a payments webhook with a bad or missing x-signature is refused before anything is read', async () => {
  const { mercadopagoGateway } = await import('../lib/payments/mercadopago');
  const body = JSON.stringify({ type: 'payment', action: 'payment.updated', data: { id: '555' } });
  const params = new URLSearchParams({ 'data.id': '555', type: 'payment', tenant: 't1' });
  // Mercado Pago stamps ts in milliseconds.
  const ts = String(Date.now());
  const manifest = `id:555;request-id:req-1;ts:${ts};`;
  const v1 = createHmac('sha256', 'mp_secret').update(manifest).digest('hex');
  const headers = (sig: string | null) => new Headers({ 'x-request-id': 'req-1', ...(sig ? { 'x-signature': sig } : {}) });

  await assert.rejects(mercadopagoGateway.parseWebhook({ rawBody: body, headers: headers(null), searchParams: params }));
  await assert.rejects(mercadopagoGateway.parseWebhook({ rawBody: body, headers: headers(`ts=${ts},v1=deadbeef`), searchParams: params }));
  // A genuine signature passes the check; with no connected tenant in the test DB the event is ignored, not thrown.
  const ev = await mercadopagoGateway.parseWebhook({ rawBody: body, headers: headers(`ts=${ts},v1=${v1}`), searchParams: new URLSearchParams({ 'data.id': '555', type: 'payment' }) });
  assert.equal(ev.type, 'ignored');
});
