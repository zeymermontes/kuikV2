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
export function signedWith(rawBody: string, header: string | null, secret: string): boolean {
  if (!secret || !header) return false;

  const expected =
    'sha256=' + createHmac('sha256', secret).update(Buffer.from(rawBody, 'utf8')).digest('hex');

  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Kuik's own app secret first; then any others handed in. A number a
 * restaurant registered in its own Meta app arrives signed with THAT app's
 * secret, which the route looks up by the phone_number_id in the payload.
 */
export function verifySignature(rawBody: string, header: string | null, extraSecrets: string[] = []): boolean {
  const secrets = [process.env.META_APP_SECRET ?? '', ...extraSecrets].filter(Boolean);
  return secrets.some((s) => signedWith(rawBody, header, s));
}

/** The GET handshake Meta performs when the webhook URL is first saved. */
export function verifyChallenge(params: URLSearchParams, extraTokens: string[] = []): string | null {
  const tokens = [process.env.WHATSAPP_VERIFY_TOKEN ?? '', ...extraTokens].filter(Boolean);
  if (tokens.length === 0) return null;
  if (params.get('hub.mode') !== 'subscribe') return null;
  const given = params.get('hub.verify_token') ?? '';
  if (!tokens.some((t) => t === given)) return null;
  return params.get('hub.challenge');
}

/**
 * Every phone_number_id an inbound payload names, read BEFORE the signature
 * is trusted — this is only used to decide which secret to check against,
 * never to act on the body.
 */
export function phoneNumberIdsIn(rawBody: string): string[] {
  try {
    const payload = JSON.parse(rawBody) as {
      entry?: { changes?: { value?: { metadata?: { phone_number_id?: string } } }[] }[];
    };
    const ids = new Set<string>();
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const id = change.value?.metadata?.phone_number_id;
        if (typeof id === 'string' && id) ids.add(id);
      }
    }
    return [...ids].slice(0, 20);
  } catch {
    return [];
  }
}
