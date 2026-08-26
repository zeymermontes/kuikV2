import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { exchangeCode, subscribeApp, getPhoneNumber, GraphApiError } from '@/lib/whatsapp/client';
import { storeToken } from '@/lib/whatsapp/credentials';
import { seedDefaults } from '@/lib/whatsapp/seed';
import { normalizeWaId } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Finish Meta's Embedded Signup.
 *
 * The client runs the Facebook popup with
 * `featureType: 'whatsapp_business_app_onboarding'` — that is what selects the
 * COEXISTENCE path, so the restaurant's number keeps working on their phone.
 * The popup hands back a code plus the ids from the session-info event; this
 * turns them into a stored connection.
 */
export async function POST(req: NextRequest) {
  const { tenant } = await requireOwner();

  let body: { code?: string; wabaId?: string; phoneNumberId?: string; branchId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const { code, wabaId, phoneNumberId } = body;
  if (!code || !wabaId || !phoneNumberId) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 });
  }

  try {
    const token = await exchangeCode(code);

    // Point our app at this business's webhooks. Skipping this is the single
    // most common reason an integration silently receives nothing — everything
    // else looks connected.
    await subscribeApp(wabaId, token);

    // Deliberately NOT calling POST /{phone_number_id}/register: that is the
    // Cloud-API migration path, and it would take the number OFF the WhatsApp
    // Business app — exactly what Coexistence exists to avoid.
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
        mode: 'coexistence',
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
