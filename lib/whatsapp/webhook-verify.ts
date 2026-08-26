import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify Meta's `X-Hub-Signature-256` over the RAW request body.
 *
 * Three things make this easy to get subtly wrong:
 *
 *  1. It must be the bytes as received. Re-serialising the parsed JSON changes
 *     key order and unicode escaping, and the digest stops matching.
 *  2. `timingSafeEqual` throws — it does not return false — when the two
 *     buffers differ in length, so the length has to be checked first.
 *  3. This is the codebase's first real signature check. The MercadoPago
 *     webhook compares a query-string secret with `!==`, which is neither
 *     constant-time nor a signature; do not use it as the model here.
 */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !header) return false;

  const expected =
    'sha256=' + createHmac('sha256', secret).update(Buffer.from(rawBody, 'utf8')).digest('hex');

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** The GET handshake Meta performs when the webhook URL is first saved. */
export function verifyChallenge(params: URLSearchParams): string | null {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!token) return null;
  if (params.get('hub.mode') !== 'subscribe') return null;
  if (params.get('hub.verify_token') !== token) return null;
  return params.get('hub.challenge');
}
