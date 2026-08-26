import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireOwner, getMemberships } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { stopSession } from '@/lib/whatsapp/bridge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Release a number from another restaurant that still holds it.
 *
 * A phone can only carry one live bridge session, so two restaurants holding
 * the same number means one of them is quietly not receiving anything. This is
 * the deliberate way to resolve that.
 *
 * Authorised per TARGET, not per current tenant: being an owner here says
 * nothing about the other business. requireOwner() only establishes who is
 * asking.
 */
export async function POST(req: NextRequest) {
  const { user } = await requireOwner();

  let tenantIds: string[] | undefined;
  try {
    ({ tenantIds } = await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!Array.isArray(tenantIds) || tenantIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'nothing_to_release' }, { status: 400 });
  }

  const owned = new Set(
    (await getMemberships(user.id))
      .filter((m) => m.role === 'owner')
      .map((m) => m.tenant.id),
  );
  const allowed = tenantIds.filter((id) => owned.has(id));
  if (allowed.length === 0) {
    return NextResponse.json({ ok: false, error: 'not_allowed' }, { status: 403 });
  }

  const supabase = createAdminClient();

  for (const tenantId of allowed) {
    // Best-effort on the bridge: even if it is unreachable, the local state
    // must stop claiming a connection that isn't there.
    await stopSession(tenantId).catch(() => {});
    await supabase
      .from('whatsapp_numbers')
      .update({
        status: 'disconnected',
        disconnected_at: new Date().toISOString(),
        pairing_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('mode', 'bridge');
  }

  revalidatePath('/whatsapp');
  return NextResponse.json({ ok: true, released: allowed.length });
}
