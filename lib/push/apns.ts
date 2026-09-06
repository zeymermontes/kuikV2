import 'server-only';
import { connect, constants, type ClientHttp2Session } from 'node:http2';
import { createSign } from 'node:crypto';
import type { PushPayload } from './send';

/**
 * Apple Push Notification service, straight from Node: a p8 key signs a JWT,
 * and each device token gets one HTTP/2 POST. The iOS app (native/mobile)
 * registers the raw APNs token, so no Firebase is needed on iOS; Android goes
 * through FCM (lib/push/fcm.ts).
 *
 * Env: APNS_KEY (the .p8 contents, raw or base64), APNS_KEY_ID, APNS_TEAM_ID,
 * APNS_BUNDLE_ID (mx.kuik.app). APNS_SANDBOX=1 targets the development
 * gateway, which is what a build from Xcode registers with.
 */

interface ApnsConfig {
  key: string;
  keyId: string;
  teamId: string;
  bundleId: string;
  host: string;
}

let config: ApnsConfig | null | undefined;
let jwt: { value: string; issuedAt: number } | null = null;
let session: ClientHttp2Session | null = null;

function loadConfig(): ApnsConfig | null {
  if (config !== undefined) return config;
  const rawKey = process.env.APNS_KEY?.trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();
  const bundleId = process.env.APNS_BUNDLE_ID?.trim() || 'mx.kuik.app';
  if (!rawKey || !keyId || !teamId) return (config = null);
  const key = rawKey.includes('-----BEGIN') ? rawKey : Buffer.from(rawKey, 'base64').toString('utf8');
  const host = process.env.APNS_SANDBOX === '1' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
  return (config = { key, keyId, teamId, bundleId, host });
}

export function apnsConfigured(): boolean {
  return loadConfig() !== null;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Apple wants the token reused for 20 to 60 minutes; a fresh one every 40. */
function bearer(c: ApnsConfig): string {
  const now = Math.floor(Date.now() / 1000);
  if (jwt && now - jwt.issuedAt < 40 * 60) return jwt.value;
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: c.keyId }));
  const claims = b64url(JSON.stringify({ iss: c.teamId, iat: now }));
  const signer = createSign('SHA256');
  signer.update(`${header}.${claims}`);
  const sig = signer.sign({ key: c.key, dsaEncoding: 'ieee-p1363' });
  jwt = { value: `${header}.${claims}.${b64url(sig)}`, issuedAt: now };
  return jwt.value;
}

function client(c: ApnsConfig): ClientHttp2Session {
  if (session && !session.closed && !session.destroyed) return session;
  session = connect(c.host);
  session.on('error', () => {
    session = null;
  });
  session.on('close', () => {
    session = null;
  });
  return session;
}

export type ApnsResult = 'sent' | 'dead' | 'failed';

/** Send one payload to one APNs device token. 'dead' means Apple retired the token; delete it. */
export function sendApns(token: string, payload: PushPayload): Promise<ApnsResult> {
  const c = loadConfig();
  if (!c) return Promise.resolve('failed');
  const body = JSON.stringify({
    aps: {
      alert: { title: payload.title, body: payload.body },
      sound: 'default',
      'thread-id': payload.tag ?? 'kuik',
      'mutable-content': 0,
    },
    url: payload.url ?? null,
    tag: payload.tag ?? null,
    ...(payload.data ?? {}),
  });
  return new Promise((resolve) => {
    let done = false;
    const finish = (r: ApnsResult) => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    try {
      const req = client(c).request({
        [constants.HTTP2_HEADER_METHOD]: 'POST',
        [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
        authorization: `bearer ${bearer(c)}`,
        'apns-topic': c.bundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 1800),
        ...(payload.tag ? { 'apns-collapse-id': payload.tag.slice(0, 64) } : {}),
        'content-type': 'application/json',
      });
      let status = 0;
      let text = '';
      req.setTimeout(10_000, () => {
        req.close();
        finish('failed');
      });
      req.on('response', (h) => {
        status = Number(h[constants.HTTP2_HEADER_STATUS] ?? 0);
      });
      req.on('data', (chunk: Buffer) => {
        text += chunk.toString();
      });
      req.on('end', () => {
        if (status === 200) return finish('sent');
        // 410 Unregistered, or 400 BadDeviceToken: the token will never work again.
        if (status === 410 || /BadDeviceToken|Unregistered|DeviceTokenNotForTopic/.test(text)) return finish('dead');
        finish('failed');
      });
      req.on('error', () => finish('failed'));
      req.end(body);
    } catch {
      finish('failed');
    }
  });
}
