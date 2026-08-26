import { after } from 'next/server';
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, bucketKey } from '@/lib/rate-limit';
import { verifyBridgeSignature } from '@/lib/whatsapp/bridge';
import { processEvents } from '@/lib/whatsapp/inbound';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY = 64 * 1024;

/**
 * Inbound messages from the whatsmeow bridge.
 *
 * Shaped to land in the same pipeline as Meta's webhook: verify, persist an
 * event row, ack, then process in `after()`. Everything downstream — the
 * conversation upsert, the idempotency check on the message id, the flow
 * engine, the AI — is shared, so the transport really is the only difference.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return new Response(null, { status: 413 });

  if (!verifyBridgeSignature(raw, req.headers.get('x-bridge-signature-256'))) {
    return new Response(null, { status: 403 });
  }

  let body: {
    tenantId?: string;
    messageId?: string;
    /** Full JID including server: "…@s.whatsapp.net" or "…@lid". */
    from?: string;
    /** Real phone number when WhatsApp discloses it; absent under LID. */
    phone?: string;
    pushName?: string;
    text?: string;
    isGroup?: boolean;
    fromMe?: boolean;
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // The bridge already filters these, but the bot answering itself is bad
  // enough to be worth checking twice.
  if (!body.tenantId || !body.messageId || !body.from || body.isGroup || body.fromMe) {
    return NextResponse.json({ ok: true });
  }

  const { ok } = await rateLimit(bucketKey('wa:bridge', body.tenantId, 60), 600, 60);
  if (!ok) return NextResponse.json({ ok: true });

  const supabase = createAdminClient();

  const { data: number } = await supabase
    .from('whatsapp_numbers')
    .select('phone_number_id')
    .eq('tenant_id', body.tenantId)
    .eq('mode', 'bridge')
    .maybeSingle();
  if (!number) return NextResponse.json({ ok: true });

  const phoneNumberId = (number as { phone_number_id: string }).phone_number_id;

  // Re-shaped into the Cloud API's payload so the existing router handles it
  // unchanged — one code path for both transports.
  const { data: row } = await supabase
    .from('whatsapp_events')
    .insert({
      phone_number_id: phoneNumberId,
      tenant_id: body.tenantId,
      field: 'messages',
      payload: {
        metadata: { phone_number_id: phoneNumberId },
        // wa_id keeps the full JID, because that is the address a reply must
        // go back to. `phone` is separate and often absent — LID addressing
        // exists precisely so the number is not disclosed.
        contacts: [{ wa_id: body.from, phone: body.phone ?? null, profile: { name: body.pushName ?? null } }],
        messages: [{
          id: body.messageId,
          from: body.from,
          type: 'text',
          text: { body: body.text ?? '' },
        }],
        _transport: 'bridge',
      },
      status: 'pending',
    })
    .select('id')
    .single();

  if (row) after(() => processEvents([(row as { id: string }).id]));

  return NextResponse.json({ ok: true });
}
