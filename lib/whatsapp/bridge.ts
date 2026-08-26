import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Client for the whatsmeow bridge — the Go sidecar that holds one linked-device
 * session per restaurant (see whatsapp-bridge/).
 *
 * Why a separate process at all: whatsmeow keeps a long-lived websocket to
 * WhatsApp and a stateful session per account. That cannot live inside a
 * request-scoped Next.js handler, and it isn't written in TypeScript.
 *
 * Auth in both directions is a shared secret: Kuik signs its calls with a
 * bearer token, the bridge signs its callbacks with an HMAC over the raw body,
 * exactly as the Meta webhook does.
 */

const BASE = process.env.WHATSAPP_BRIDGE_URL;
const SECRET = process.env.WHATSAPP_BRIDGE_SECRET;

export function bridgeConfigured(): boolean {
  return Boolean(BASE && SECRET);
}

export interface BridgeSession {
  sessionId: string;
  status: 'pairing' | 'connected' | 'disconnected' | 'error';
  /** Raw QR payload while pairing; the client renders it. */
  qr?: string | null;
  /** How long this particular code has been on offer. */
  qrAgeSeconds?: number;
  /** Time left in the whole pairing attempt before the bridge gives up. */
  expiresInSeconds?: number;
  phone?: string | null;
  pushName?: string | null;
  error?: string | null;
}

class BridgeError extends Error {}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE || !SECRET) throw new BridgeError('bridge_not_configured');
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${SECRET}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {}),
    },
    // The bridge is a sidecar on the same network; anything slower than this is
    // a hang, not latency.
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  if (!res.ok) throw new BridgeError(text.slice(0, 300) || `bridge ${res.status}`);
  return (text ? JSON.parse(text) : {}) as T;
}

/** Begin pairing. The QR arrives here and refreshes until it's scanned. */
export function startSession(tenantId: string): Promise<BridgeSession> {
  return call<BridgeSession>(`/sessions/${tenantId}`, { method: 'POST' });
}

export function getSession(tenantId: string): Promise<BridgeSession> {
  return call<BridgeSession>(`/sessions/${tenantId}`);
}

export function stopSession(tenantId: string): Promise<{ ok: boolean }> {
  return call(`/sessions/${tenantId}`, { method: 'DELETE' });
}

export interface BridgeSendResult {
  id: string;
}

export function sendViaBridge(
  tenantId: string,
  to: string,
  message: { text: string; buttons?: { id: string; title: string }[] },
): Promise<BridgeSendResult> {
  return call<BridgeSendResult>(`/sessions/${tenantId}/send`, {
    method: 'POST',
    body: JSON.stringify({ to, ...message }),
  });
}

/**
 * Verify a callback from the bridge. Same shape as the Meta webhook check:
 * HMAC over the raw bytes, constant-time compare, length guarded first because
 * timingSafeEqual throws on a mismatch rather than returning false.
 */
export function verifyBridgeSignature(rawBody: string, header: string | null): boolean {
  if (!SECRET || !header) return false;
  const expected =
    'sha256=' + createHmac('sha256', SECRET).update(Buffer.from(rawBody, 'utf8')).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface BridgeDiagnostics {
  reachable: boolean;
  /** Tenants the bridge currently holds a live session for. */
  sessions: BridgeSession[];
  error?: string;
}

/**
 * What the bridge itself believes, as opposed to what our own tables say.
 *
 * These disagree more often than is comfortable: a row can read "connected"
 * while the bridge holds no session at all, which is exactly the state that
 * looks like "the bot is ignoring me".
 */
export async function diagnose(): Promise<BridgeDiagnostics> {
  if (!bridgeConfigured()) return { reachable: false, sessions: [], error: 'bridge_not_configured' };
  try {
    const { sessions } = await call<{ sessions: BridgeSession[] }>('/sessions');
    return { reachable: true, sessions: sessions ?? [] };
  } catch (err) {
    return { reachable: false, sessions: [], error: String(err).slice(0, 200) };
  }
}
