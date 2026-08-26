import { NextResponse, type NextRequest } from 'next/server';
import { tryTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Store (or refresh) this browser's push subscription for the active tenant.
 *
 * Guarded with tryTenant() rather than requireTenant(): a route handler must
 * answer 401, not 307 to an HTML login page, or a service worker's fetch just
 * follows the redirect and "succeeds" with a login screen.
 */
export async function POST(req: NextRequest) {
  const ctx = await tryTenant();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });

  let body: {
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    oldEndpoint?: string | null;
    locale?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys.auth) {
    return NextResponse.json({ ok: false, error: 'invalid_subscription' }, { status: 400 });
  }

  const supabase = await createClient();

  // A rotated endpoint leaves the old row behind, which would then 410 forever.
  if (body.oldEndpoint && body.oldEndpoint !== sub.endpoint) {
    await supabase.from('push_subscriptions').delete().eq('endpoint', body.oldEndpoint);
  }

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      tenant_id: ctx.tenant.id,
      user_id: ctx.user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      locale: body.locale || ctx.user.profile.locale || 'es',
      user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
      last_seen_at: new Date().toISOString(),
      failed_at: null,
    },
    { onConflict: 'tenant_id,endpoint' },
  );

  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
