import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { exchangeCode, subscribeApp, getPhoneNumber, registerPhoneNumber, GraphApiError } from '@/lib/whatsapp/client';
import { derivePin } from '@/lib/crypto';
import { storeToken } from '@/lib/whatsapp/credentials';
import { seedDefaults } from '@/lib/whatsapp/seed';
import { normalizeWaId } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Finish Meta's Embedded Signup.
 *
 * Two flavours, chosen by the owner before the popup opens:
 *  - `coexistence`: the popup ran with `featureType:
 *    'whatsapp_business_app_onboarding'`, so the number stays on the phone.
 *    No /register call — that is the migration path and would take it off.
 *  - `cloud_api`: a new or dedicated number added inside the popup. It has to
 *    be registered for Cloud API messaging before it can send anything.
 *
 * Either way the popup hands back a code plus the ids from the session-info
 * event; this turns them into a stored connection.
 */
export async function POST(req: NextRequest) {
  const { tenant } = await requireOwner();

  let body: {
    code?: string; wabaId?: string; phoneNumberId?: string; branchId?: string | null;
    mode?: 'coexistence' | 'cloud_api';
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const { code, wabaId, phoneNumberId } = body;
  const mode = body.mode === 'cloud_api' ? 'cloud_api' : 'coexistence';
  if (!code) return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  // The popup finished but never posted the ids (or posted a WABA with no
  // number in it). Distinct from a malformed request: the owner has to go
  // through the popup again, adding a number this time.
  if (!wabaId || !phoneNumberId) {
    return NextResponse.json({ ok: false, error: 'no_session_info' }, { status: 400 });
  }

  try {
    const token = await exchangeCode(code);

    // Point our app at this business's webhooks. Skipping this is the single
    // most common reason an integration silently receives nothing — everything
    // else looks connected.
    await subscribeApp(wabaId, token);

    if (mode === 'cloud_api') {
      // A fresh Cloud API number is nothing until registered. Under
      // coexistence this call is deliberately skipped: it is the migration
      // path and would take the number OFF the WhatsApp Business app.
      try {
        await registerPhoneNumber(phoneNumberId, token, derivePin(phoneNumberId));
      } catch (err) {
        const graph = err instanceof GraphApiError ? err : null;
        return NextResponse.json(
          { ok: false, error: 'register_failed', detail: graph?.message ?? String(err), code: graph?.code },
          { status: 502 },
        );
      }
    }

    const info = await getPhoneNumber(phoneNumberId, token);

    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from('whatsapp_numbers')
      .select('id')
      .eq('tenant_id', tenant.id)
      .limit(1);

    await supabase.from('whatsapp_numbers').upsert(
      {
        tenant_id: tenant.id,
        branch_id: body.branchId ?? null,
        waba_id: wabaId,
        phone_number_id: phoneNumberId,
        display_phone_number: info.display_phone_number,
        phone_e164: normalizeWaId(info.display_phone_number),
        verified_name: info.verified_name ?? null,
        quality_rating: info.quality_rating ?? null,
        messaging_limit_tier: info.messaging_limit_tier ?? null,
        mode,
        status: 'connected',
        is_default: !existing || existing.length === 0,
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'phone_number_id' },
    );

    await storeToken(phoneNumberId, tenant.id, wabaId, token);
    await seedDefaults(tenant.id, wabaId);

    revalidatePath('/whatsapp');
    return NextResponse.json({ ok: true, phone: info.display_phone_number });
  } catch (err) {
    const graph = err instanceof GraphApiError ? err : null;
    return NextResponse.json(
      { ok: false, error: graph?.message ?? 'connect_failed', code: graph?.code },
      { status: 502 },
    );
  }
}
