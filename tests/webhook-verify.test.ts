import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifySignature, verifyChallenge, phoneNumberIdsIn, signedWith } from '../lib/whatsapp/webhook-verify';

const sign = (body: string, secret: string) =>
  'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

process.env.META_APP_SECRET = 'kuik-secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'kuik-verify';

const body = JSON.stringify({
  entry: [
    { changes: [{ value: { metadata: { phone_number_id: '111' } } }] },
    { changes: [{ value: { metadata: { phone_number_id: '222' } } }, { value: {} }] },
  ],
});

test('a body signed with the global secret verifies', () => {
  assert.equal(verifySignature(body, sign(body, 'kuik-secret')), true);
});

test('a body signed with a restaurant app secret verifies only when that secret is offered', () => {
  const header = sign(body, 'own-app-secret');
  assert.equal(verifySignature(body, header), false);
  assert.equal(verifySignature(body, header, ['other', 'own-app-secret']), true);
});

test('a header of the wrong length or a missing header is refused, not thrown', () => {
  assert.equal(signedWith(body, 'sha256=abc', 'kuik-secret'), false);
  assert.equal(signedWith(body, null, 'kuik-secret'), false);
  assert.equal(signedWith(body, sign(body, 'x'), ''), false);
});

test('the phone_number_ids are read without trusting anything else', () => {
  assert.deepEqual(phoneNumberIdsIn(body), ['111', '222']);
  assert.deepEqual(phoneNumberIdsIn('not json'), []);
  assert.deepEqual(phoneNumberIdsIn('{}'), []);
});

test('the handshake accepts the global token or a per-number one', () => {
  const params = (token: string) =>
    new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': token, 'hub.challenge': '42' });
  assert.equal(verifyChallenge(params('kuik-verify')), '42');
  assert.equal(verifyChallenge(params('per-number')), null);
  assert.equal(verifyChallenge(params('per-number'), ['per-number']), '42');
  assert.equal(verifyChallenge(new URLSearchParams({ 'hub.mode': 'unsubscribe', 'hub.verify_token': 'kuik-verify' })), null);
});
