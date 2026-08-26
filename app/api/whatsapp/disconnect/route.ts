import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { unsubscribeApp } from '@/lib/whatsapp/client';
import { getToken, deleteToken } from '@/lib/whatsapp/credentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Let go of a number. The restaurant keeps using it on their phone; only the
 * API side is unhooked.
 */
export async function POST(req: NextRequest) {
  const { tenant } = await requireOwner();

  let phoneNumberId: string | undefined;
  try {
    ({ phoneNumberId } = await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!phoneNumberId) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('whatsapp_numbers')
    .select('waba_id')
    .eq('phone_number_id', phoneNumberId)
    .eq('tenant_id', tenant.id)
    .maybeSingle();
  if (!data) return NextResponse.json({ ok: false }, { status: 404 });

  const token = await getToken(phoneNumberId);
  if (token) {
    // Best-effort: if Meta refuses, the local state still has to come off.
    await unsubscribeApp((data as { waba_id: string }).waba_id, token).catch(() => {});
  }

  await supabase
    .from('whatsapp_numbers')
    .update({
      status: 'disconnected',
      disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('phone_number_id', phoneNumberId)
    .eq('tenant_id', tenant.id);

  // Hard-delete the credential rather than leaving a live token lying around.
  await deleteToken(phoneNumberId);

  revalidatePath('/whatsapp');
  return NextResponse.json({ ok: true });
}
