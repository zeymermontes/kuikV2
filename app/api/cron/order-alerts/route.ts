import { NextResponse, type NextRequest } from 'next/server';
import { escalateOrders } from '@/lib/orders/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Paid orders nobody accepted: nudge, then escalate (lib/orders/notify.ts).
 * Runs every two minutes; each step is recorded on the order, so overlapping
 * runs and retries never repeat an alert.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const result = await escalateOrders();
  return NextResponse.json({ ok: true, ...result });
}
