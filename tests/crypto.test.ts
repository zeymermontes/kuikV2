import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, open, last4 } from '../lib/crypto';

// keyFor() reads the env lazily, inside each call, so setting it here — after
// the import — is enough and keeps this a plain static import.
process.env.KUIK_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');

test('round trip', () => {
  const s = seal('EAAG...token', 'phone-123');
  assert.equal(open(s, 'phone-123'), 'EAAG...token');
});

test('a ciphertext moved to another row will not open', () => {
  const s = seal('tenant-A-token', 'phone-A');
  assert.throws(() => open(s, 'phone-B'), /unable to authenticate|bad decrypt|auth/i);
});

test('a tampered ciphertext will not open', () => {
  const s = seal('secret', 'aad');
  s.ct[0] ^= 0xff;
  assert.throws(() => open(s, 'aad'));
});

test('each seal uses a fresh iv', () => {
  const a = seal('same', 'aad'), b = seal('same', 'aad');
  assert.notEqual(a.iv.toString('hex'), b.iv.toString('hex'));
  assert.notEqual(a.ct.toString('hex'), b.ct.toString('hex'));
});

test('sealing without an aad is refused', () => {
  assert.throws(() => seal('x', ''), /aad/);
});

test('a wrong-length key is rejected loudly', async () => {
  process.env.KUIK_SECRET_KEY = Buffer.alloc(16).toString('base64');
  assert.throws(() => seal('x', 'aad'), /32 bytes/);
  process.env.KUIK_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
});

test('last4', () => assert.equal(last4('sk-abcd1234'), '1234'));
