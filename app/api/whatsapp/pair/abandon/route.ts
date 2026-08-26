import { NextResponse } from 'next/server';
import { tryTenant } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { stopSession } from '@/lib/whatsapp/bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Release a pairing attempt when the dashboard tab goes away.
 *
 * Called via `navigator.sendBeacon` on `pagehide`, which is fire-and-forget and
 * survives the page unloading — a normal fetch would be cancelled. Without it,
 * closing the tab leaves the bridge holding a WhatsApp socket until its own
 * two-minute deadline expires.
 *
 * tryTenant() rather than requireOwner(): a beacon cannot follow a redirect,
 * and a 401 here is harmless — the bridge's deadline is the real backstop.
 */
export async function POST() {
  const ctx = await tryTenant();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });

  const supabase = createAdminClient();
  const phoneNumberId = `bridge:${ctx.tenant.id}`;

  // Only abandon an attempt still in progress; a connected number must survive
  // the tab closing.
  const { data } = await supabase
    .from('whatsapp_numbers')
    .select('status')
    .eq('phone_number_id', phoneNumberId)
    .maybeSingle();

  if ((data as { status: string } | null)?.status !== 'pairing') {
    return NextResponse.json({ ok: true });
  }

  await stopSession(ctx.tenant.id).catch(() => {});
  await supabase
    .from('whatsapp_numbers')
    .update({ status: 'disconnected', pairing_expires_at: null, updated_at: new Date().toISOString() })
    .eq('phone_number_id', phoneNumberId);

  return NextResponse.json({ ok: true });
}
