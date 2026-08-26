import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { tryTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { APP_URL } from '@/lib/config';
import type { ReservationStatus } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED: ReservationStatus[] = ['pending', 'confirmed', 'seated', 'cancelled'];

/**
 * Confirm or cancel a booking from a notification's action button.
 *
 * This exists as a route rather than a server action because a service worker
 * cannot invoke one — a server action is addressed by a build-time id over a
 * private protocol. The SW calls this with `credentials: 'include'`, so the
 * normal session cookies come along; it never needs to read them itself.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Defence in depth against a cross-site POST. Supabase's cookies are
  // SameSite=Lax so one wouldn't carry credentials anyway, but a custom header
  // cannot be set cross-origin without a preflight, and we serve no CORS.
  if (req.headers.get('x-kuik-client') !== 'sw') {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const origin = req.headers.get('origin');
  if (origin && origin !== APP_URL && !origin.startsWith('http://localhost')) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  const ctx = await tryTenant();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });

  const { id } = await params;
  let status: ReservationStatus | undefined;
  try {
    ({ status } = await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!status || !ALLOWED.includes(status)) {
    return NextResponse.json({ ok: false, error: 'bad_status' }, { status: 400 });
  }

  // Written through the caller's own session, so RLS (can_manage_reservations)
  // decides whether they may — no role check duplicated here.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('reservations')
    .update({ status })
    .eq('id', id)
    .eq('tenant_id', ctx.tenant.id)
    .select('id');

  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  if (!data || data.length === 0) {
    return NextResponse.json({ ok: false, error: 'not_allowed' }, { status: 403 });
  }

  revalidatePath('/reservations');
  return NextResponse.json({ ok: true });
}
