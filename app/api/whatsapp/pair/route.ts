import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { startSession, getSession, stopSession, bridgeConfigured } from '@/lib/whatsapp/bridge';
import { seedDefaults } from '@/lib/whatsapp/seed';
import { toE164 } from '@/lib/phone';
import { getMemberships } from '@/lib/auth';

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

export interface NumberConflict {
  tenantId: string;
  name: string;
  /** Whether this user may release it themselves. */
  canRelease: boolean;
}

/**
 * Other restaurants already holding this number.
 *
 * One phone can only have one live bridge session, so a second restaurant
 * pairing it silently steals the first one's messages. Surfacing the clash lets
 * someone decide, instead of finding out when a bot goes quiet.
 *
 * `canRelease` is false for a business this user has no say over — the row is
 * shown so the situation is explicable, not so it can be taken over.
 */
async function findConflicts(
  supabase: ReturnType<typeof createAdminClient>,
  phoneE164: string,
  currentTenantId: string,
  userId: string,
): Promise<NumberConflict[]> {
  if (!phoneE164) return [];

  const { data } = await supabase
    .from('whatsapp_numbers')
    .select('tenant_id, tenants(name)')
    .eq('phone_e164', phoneE164)
    .neq('tenant_id', currentTenantId)
    .in('status', ['connected', 'pairing']);

  const rows = (data ?? []) as unknown as { tenant_id: string; tenants: { name: string } | { name: string }[] | null }[];
  if (rows.length === 0) return [];

  const mine = new Set(
    (await getMemberships(userId))
      .filter((m) => m.role === 'owner')
      .map((m) => m.tenant.id),
  );

  return rows.map((r) => {
    const t = Array.isArray(r.tenants) ? r.tenants[0] : r.tenants;
    return {
      tenantId: r.tenant_id,
      name: t?.name ?? r.tenant_id,
      canRelease: mine.has(r.tenant_id),
    };
  });
}

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
  const { tenant, user } = await requireOwner();
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

      const conflicts = await findConflicts(
        supabase,
        session.phone ? (toE164(session.phone) ?? '') : '',
        tenant.id,
        user.id,
      );
      return NextResponse.json({ ok: true, ...session, conflicts });
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
