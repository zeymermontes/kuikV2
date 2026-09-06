import 'server-only';
import { createSign } from 'node:crypto';
import type { PushPayload } from './send';

/**
 * Firebase Cloud Messaging, HTTP v1, without the firebase-admin SDK: a
 * service-account JWT swapped for an OAuth token, then one POST per device.
 * Android only; iOS tokens go to APNs directly (lib/push/apns.ts), so the
 * iOS app carries no Firebase SDK.
 *
 * FCM_SERVICE_ACCOUNT holds the service account JSON (raw, or base64 so it
 * fits in one env line). Unset = native push is off and sends are skipped.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let account: ServiceAccount | null | undefined;
let cachedToken: { value: string; expiresAt: number } | null = null;

function loadAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  const raw = process.env.FCM_SERVICE_ACCOUNT?.trim();
  if (!raw) return (account = null);
  try {
    const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as Partial<ServiceAccount>;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return (account = null);
    return (account = parsed as ServiceAccount);
  } catch {
    return (account = null);
  }
}

export function fcmConfigured(): boolean {
  return loadAccount() !== null;
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const jwt = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  if (!res.ok) throw new Error(`fcm oauth ${res.status}`);
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: j.access_token, expiresAt: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

export type FcmResult = 'sent' | 'dead' | 'failed';

/** Send one payload to one device token. 'dead' means the token is gone for good and should be deleted. */
export async function sendFcm(token: string, payload: PushPayload): Promise<FcmResult> {
  const sa = loadAccount();
  if (!sa) return 'failed';
  let bearer: string;
  try {
    bearer = await accessToken(sa);
  } catch {
    return 'failed';
  }
  const data: Record<string, string> = {};
  if (payload.url) data.url = payload.url;
  if (payload.tag) data.tag = payload.tag;
  for (const [k, v] of Object.entries(payload.data ?? {})) data[k] = typeof v === 'string' ? v : JSON.stringify(v);

  const message = {
    token,
    notification: { title: payload.title, body: payload.body },
    data,
    android: {
      priority: 'high',
      ttl: '1800s',
      notification: { channel_id: 'kuik', tag: payload.tag, sound: 'default' },
    },
  };
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (res.ok) return 'sent';
  // 404 UNREGISTERED: the app was uninstalled or the token rotated.
  // 400 INVALID_ARGUMENT on the token: never valid. Both are permanent.
  if (res.status === 404) return 'dead';
  if (res.status === 400) {
    const text = await res.text().catch(() => '');
    if (/INVALID_ARGUMENT|not a valid FCM registration token/i.test(text)) return 'dead';
  }
  return 'failed';
}
