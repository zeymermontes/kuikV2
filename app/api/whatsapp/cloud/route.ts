import { randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { graphGet, subscribeApp, getPhoneNumber, GraphApiError } from '@/lib/whatsapp/client';
import { storeToken } from '@/lib/whatsapp/credentials';
import { seedDefaults } from '@/lib/whatsapp/seed';
import { normalizeWaId } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Connect a number through the restaurant's OWN Meta app.
 *
 * The alternative to both the QR bridge and Embedded Signup: the owner follows
 * the guide in the dashboard, registers the number in an app they create, and
 * pastes four things here — phone number id, WABA id, a permanent system-user
 * token and the app secret. Nothing of Kuik's Meta app is involved, so this
 * works with no Tech Provider status at all.
 *
 * Everything pasted is checked against Graph before it is stored: the token
 * must open the phone number, and the phone number must belong to the WABA.
 * Then the app is subscribed to the WABA and a verify token is minted for the
 * webhook handshake the owner still has to configure on Meta's side.
 */

const ID = /^\d{6,32}$/;

export async function POST(req: NextRequest) {
  const { tenant } = await requireOwner();

  let body: { phoneNumberId?: string; wabaId?: string; token?: string; appSecret?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const phoneNumberId = (body.phoneNumberId ?? '').trim();
  const wabaId = (body.wabaId ?? '').trim();
  const token = (body.token ?? '').trim();
  const appSecret = (body.appSecret ?? '').trim();
  if (!ID.test(phoneNumberId) || !ID.test(wabaId) || token.length < 20 || !/^[0-9a-f]{16,64}$/i.test(appSecret)) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // One channel per restaurant: a paired phone still live would mean two bots
  // on the same business. Unlinking first is deliberate, not automatic.
  const { data: bridge } = await supabase
    .from('whatsapp_numbers')
    .select('phone_number_id')
    .eq('tenant_id', tenant.id)
    .eq('mode', 'bridge')
    .in('status', ['connected', 'pairing'])
    .limit(1);
  if (bridge && bridge.length > 0) {
    return NextResponse.json({ ok: false, error: 'bridge_connected' }, { status: 409 });
  }

  // phone_number_id is unique across every tenant; an upsert would silently
  // move another restaurant's number here.
  const { data: taken } = await supabase
    .from('whatsapp_numbers')
    .select('tenant_id')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();
  if (taken && (taken as { tenant_id: string }).tenant_id !== tenant.id) {
    return NextResponse.json({ ok: false, error: 'number_taken' }, { status: 409 });
  }

  try {
    const info = await getPhoneNumber(phoneNumberId, token);

    const owned = await graphGet<{ data?: { id: string }[] }>(
      `${wabaId}/phone_numbers?fields=id&limit=100`,
      token,
    );
    if (!(owned.data ?? []).some((n) => n.id === phoneNumberId)) {
      return NextResponse.json({ ok: false, error: 'phone_not_in_waba' }, { status: 400 });
    }

    // Without this the webhook is configured, the handshake passes, and
    // nothing ever arrives.
    await subscribeApp(wabaId, token);

    // The partial unique index allows one default per tenant; a disconnected
    // bridge row still holds the flag.
    await supabase
      .from('whatsapp_numbers')
      .update({ is_default: false })
      .eq('tenant_id', tenant.id)
      .neq('phone_number_id', phoneNumberId);

    await supabase.from('whatsapp_numbers').upsert(
      {
        tenant_id: tenant.id,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: info.display_phone_number,
        phone_e164: normalizeWaId(info.display_phone_number),
        verified_name: info.verified_name ?? null,
        quality_rating: info.quality_rating ?? null,
        messaging_limit_tier: info.messaging_limit_tier ?? null,
        mode: 'cloud_api',
        status: 'connected',
        is_default: true,
        connected_at: new Date().toISOString(),
        disconnected_at: null,
        error_code: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'phone_number_id' },
    );

    const verifyToken = randomBytes(18).toString('hex');
    await storeToken(phoneNumberId, tenant.id, wabaId, token, null, { appSecret, verifyToken });
    await seedDefaults(tenant.id, wabaId);

    revalidatePath('/whatsapp');
    return NextResponse.json({ ok: true, phone: info.display_phone_number, verifyToken });
  } catch (err) {
    const graph = err instanceof GraphApiError ? err : null;
    // 190 is Meta's "invalid OAuth access token"; the rest is passed through.
    const error = graph?.code === 190 ? 'bad_token' : graph?.message ?? 'connect_failed';
    return NextResponse.json({ ok: false, error, code: graph?.code }, { status: graph ? 400 : 502 });
  }
}
