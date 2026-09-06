import { NextResponse, type NextRequest } from 'next/server';
import { tryTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { APP_URL } from '@/lib/config';
import { onOrderStatus } from '@/lib/orders/notify';
import type { OrderStatus } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED: OrderStatus[] = ['preparing', 'ready', 'done'];

/**
 * Accept an order from a notification's action button. A route rather than a
 * server action because a service worker cannot invoke one (see
 * app/api/reservations/[id]/status). The SW sends the session cookies along.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (req.headers.get('x-kuik-client') !== 'sw') return NextResponse.json({ ok: false }, { status: 403 });
  const origin = req.headers.get('origin');
  if (origin && origin !== APP_URL && !origin.startsWith('http://localhost')) return NextResponse.json({ ok: false }, { status: 403 });

  const ctx = await tryTenant();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });

  const { id } = await params;
  let status: OrderStatus | undefined;
  try {
    ({ status } = await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!status || !ALLOWED.includes(status)) return NextResponse.json({ ok: false, error: 'bad_status' }, { status: 400 });

  // Through the caller's own session, so RLS (orders_update: any member) applies.
  const supabase = await createClient();
  const { error } = await supabase.from('orders').update({ status }).eq('id', id).eq('tenant_id', ctx.tenant.id);
  if (error) return NextResponse.json({ ok: false }, { status: 403 });
  await onOrderStatus(id, ctx.tenant.id, status);
  return NextResponse.json({ ok: true });
}
