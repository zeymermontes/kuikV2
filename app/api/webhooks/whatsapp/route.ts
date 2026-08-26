import { after } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, bucketKey } from '@/lib/rate-limit';
import { verifySignature, verifyChallenge } from '@/lib/whatsapp/webhook-verify';
import { processEvents } from '@/lib/whatsapp/inbound';

// node:crypto's timingSafeEqual is unavailable on the edge runtime.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 128 * 1024;

/**
 * Meta's webhook handshake.
 *
 * The challenge must come back as PLAIN TEXT. NextResponse.json would wrap it
 * in quotes, Meta compares byte for byte, and verification fails with no
 * useful error.
 */
export async function GET(req: NextRequest) {
  const challenge = verifyChallenge(req.nextUrl.searchParams);
  if (challenge === null) return new Response('Forbidden', { status: 403 });
  return new Response(challenge, {
    status: 200,
    headers: { 'content-type': 'text/plain' },
  });
}

/**
 * Inbound events.
 *
 * Deliberately fast-ack: verify, persist, return 200, then work in `after()`.
 * Meta retries aggressively and an AI turn takes seconds, so doing the work
 * inline would guarantee duplicate processing and eventually a disabled
 * webhook. Durability comes from the persisted row — a process killed
 * mid-flight leaves it 'pending' for the maintenance cron to pick up.
 */
export async function POST(req: NextRequest) {
  // Raw text FIRST: the body can only be read once, and the signature is over
  // exactly these bytes.
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response(null, { status: 413 });

  if (!verifySignature(raw, req.headers.get('x-hub-signature-256'))) {
    // 403, not 200. Unlike a genuine Meta retry, a forged request is not
    // something we want to encourage by acknowledging it.
    return new Response(null, { status: 403 });
  }

  let payload: {
    entry?: { id?: string; changes?: { field?: string; value?: Record<string, unknown> }[] }[];
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // never make Meta retry a bad body
  }

  const supabase = createAdminClient();
  const ids: string[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = (change.value ?? {}) as { metadata?: { phone_number_id?: string } };
      const phoneNumberId = value.metadata?.phone_number_id ?? null;

      // Cheap shield against a flood on one number.
      if (phoneNumberId) {
        const { ok } = await rateLimit(bucketKey('wa:in', phoneNumberId, 60), 600, 60);
        if (!ok) continue;
      }

      const { data: number } = phoneNumberId
        ? await supabase
            .from('whatsapp_numbers')
            .select('tenant_id')
            .eq('phone_number_id', phoneNumberId)
            .maybeSingle()
        : { data: null };

      const { data: row } = await supabase
        .from('whatsapp_events')
        .insert({
          phone_number_id: phoneNumberId,
          tenant_id: (number as { tenant_id: string } | null)?.tenant_id ?? null,
          field: change.field ?? null,
          payload: change.value ?? {},
          // An unknown number is stored, not processed — useful forensics if
          // someone points a stray account at this URL.
          status: number ? 'pending' : 'ignored',
        })
        .select('id')
        .single();

      if (row && number) ids.push((row as { id: string }).id);
    }
  }

  // Runs after the response is flushed. Render is an always-on Node service, so
  // this genuinely executes; the persisted rows cover the case where it doesn't.
  if (ids.length > 0) after(() => processEvents(ids));

  return NextResponse.json({ ok: true });
}
