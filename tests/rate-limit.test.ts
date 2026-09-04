import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clientIp, bucketKey } from '../lib/rate-limit';

const req = (headers: Record<string, string>) =>
  new Request('https://x.test/', { headers });

test('cf-connecting-ip wins when Cloudflare fronts the request', () => {
  assert.equal(
    clientIp(req({ 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': 'fake, 203.0.113.9, 172.70.0.1' })),
    '203.0.113.9',
  );
});

test('a spoofed x-forwarded-for FIRST entry is ignored', () => {
  // The attack this closes: one forged header per request used to mean one
  // fresh rate-limit bucket per request. Only the last hop — appended by
  // Render's own proxy — is trusted.
  assert.equal(
    clientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' })),
    '203.0.113.9',
  );
  assert.equal(clientIp(req({ 'x-forwarded-for': '203.0.113.9' })), '203.0.113.9');
});

test('no proxy headers at all still yields a bucket id', () => {
  assert.equal(clientIp(req({})), 'unknown');
  assert.equal(clientIp(req({ 'x-real-ip': '198.51.100.7' })), '198.51.100.7');
  assert.equal(clientIp(req({ 'x-forwarded-for': ' , ' })), 'unknown');
});

test('bucketKey pins scope, id and window slot', () => {
  const k = bucketKey('res:ip', 't1:203.0.113.9', 60);
  assert.match(k, /^res:ip:t1:203\.0\.113\.9:\d+$/);
});
