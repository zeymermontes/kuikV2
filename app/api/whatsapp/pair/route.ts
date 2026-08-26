import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { startSession, getSession, stopSession, bridgeConfigured } from '@/lib/whatsapp/bridge';
import { seedDefaults } from '@/lib/whatsapp/seed';
import { toE164 } from '@/lib/phone';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * QR pairing through the whatsmeow bridge.
 *
 * POST begins a session and returns the first QR; GET is polled while the code
 * is on screen, because the codes expire every ~20 seconds and whatsmeow emits
 * a fresh one each time.
 */

/** Synthetic id standing in for Meta's phone_number_id, which does not exist here. */
const bridgeId = (tenantId: string) => `bridge:${tenantId}`;

export async function POST() {
  const { tenant } = await requireOwner();
  if (!bridgeConfigured()) {
    return NextResponse.json({ ok: false, error: 'bridge_not_configured' }, { status: 503 });
  }

  try {
    const session = await startSession(tenant.id);
    const supabase = createAdminClient();

    await supabase.from('whatsapp_numbers').upsert(
      {
        tenant_id: tenant.id,
        waba_id: 'bridge',
        phone_number_id: bridgeId(tenant.id),
        display_phone_number: session.phone ? `+${session.phone}` : 'pendiente',
        phone_e164: session.phone ? (toE164(session.phone) ?? '') : '',
        mode: 'bridge',
        status: session.status === 'connected' ? 'connected' : 'pairing',
        bridge_session_id: session.sessionId,
        // The QR is short-lived; this is what the UI uses to stop polling.
        pairing_expires_at: new Date(Date.now() + 120_000).toISOString(),
        is_default: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'phone_number_id' },
    );

    return NextResponse.json({ ok: true, ...session });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err).slice(0, 200) }, { status: 502 });
  }
}

export async function GET() {
  const { tenant } = await requireOwner();
  if (!bridgeConfigured()) {
    return NextResponse.json({ ok: false, error: 'bridge_not_configured' }, { status: 503 });
  }

  const supabaseRead = createAdminClient();

  // The server decides when a pairing attempt is over, not the browser: a tab
  // can be closed, reloaded or left open overnight, and none of that should
  // change whether the code is still good.
  const { data: existing } = await supabaseRead
    .from('whatsapp_numbers')
    .select('status, pairing_expires_at')
    .eq('phone_number_id', bridgeId(tenant.id))
    .maybeSingle();

  const row = existing as { status: string; pairing_expires_at: string | null } | null;
  if (
    row?.status === 'pairing' &&
    row.pairing_expires_at &&
    new Date(row.pairing_expires_at) < new Date()
  ) {
    await stopSession(tenant.id).catch(() => {});
    await supabaseRead
      .from('whatsapp_numbers')
      .update({ status: 'disconnected', pairing_expires_at: null, updated_at: new Date().toISOString() })
      .eq('phone_number_id', bridgeId(tenant.id));
    return NextResponse.json({ ok: true, status: 'disconnected', error: 'qr_expired' });
  }

  try {
    const session = await getSession(tenant.id);

    if (session.status === 'connected') {
      const supabase = createAdminClient();
      await supabase
        .from('whatsapp_numbers')
        .update({
          status: 'connected',
          display_phone_number: session.phone ? `+${session.phone}` : 'conectado',
          phone_e164: session.phone ? (toE164(session.phone) ?? '') : '',
          verified_name: session.pushName ?? null,
          connected_at: new Date().toISOString(),
          pairing_expires_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('phone_number_id', bridgeId(tenant.id));

      // Seeding on every poll is fine: every insert is ignoreDuplicates, so a
      // restaurant never loses edits by reconnecting.
      await seedDefaults(tenant.id, 'bridge');
      revalidatePath('/whatsapp');
    }

    return NextResponse.json({ ok: true, ...session });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err).slice(0, 200) }, { status: 502 });
  }
}

export async function DELETE() {
  const { tenant } = await requireOwner();
  try {
    await stopSession(tenant.id);
  } catch {
    // Even if the bridge is unreachable, the local state must come off.
  }
  const supabase = createAdminClient();
  await supabase
    .from('whatsapp_numbers')
    .update({
      status: 'disconnected',
      disconnected_at: new Date().toISOString(),
      pairing_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('phone_number_id', bridgeId(tenant.id));

  revalidatePath('/whatsapp');
  return NextResponse.json({ ok: true });
}
