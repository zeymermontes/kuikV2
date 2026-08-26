import { NextResponse, type NextRequest } from 'next/server';
import { tryTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Drop this browser's subscription for the active tenant. */
export async function POST(req: NextRequest) {
  const ctx = await tryTenant();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });

  let endpoint: string | undefined;
  try {
    ({ endpoint } = await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!endpoint) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = await createClient();
  // RLS keeps this to the caller's own rows.
  await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('tenant_id', ctx.tenant.id);

  return NextResponse.json({ ok: true });
}
