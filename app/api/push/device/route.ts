import { NextResponse, type NextRequest } from 'next/server';
import { tryTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Store (or refresh) this device's FCM token for the active tenant. The Kuik
 * app (native/mobile) posts it on every launch, like the web subscription,
 * so a rotated token heals itself. See push/subscribe for the 401 rationale.
 */
export async function POST(req: NextRequest) {
  const ctx = await tryTenant();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });

  let body: { token?: string; platform?: string; app?: string; locale?: string; oldToken?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const token = (body.token ?? '').trim();
  const platform = body.platform === 'ios' || body.platform === 'android' ? body.platform : null;
  if (!token || token.length > 4096 || !platform) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 400 });
  }

  const supabase = await createClient();
  if (body.oldToken && body.oldToken !== token) {
    await supabase.from('device_push_tokens').delete().eq('token', body.oldToken);
  }
  const { error } = await supabase.from('device_push_tokens').upsert(
    {
      tenant_id: ctx.tenant.id,
      user_id: ctx.user.id,
      token,
      platform,
      app: body.app === 'terminal' ? 'terminal' : 'kuik',
      locale: body.locale || ctx.user.profile.locale || 'es',
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,token' },
  );
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Forget this device (sign-out from the app). */
export async function DELETE(req: NextRequest) {
  const ctx = await tryTenant();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });
  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!body.token) return NextResponse.json({ ok: false }, { status: 400 });
  const supabase = await createClient();
  await supabase.from('device_push_tokens').delete().eq('token', body.token);
  return NextResponse.json({ ok: true });
}
