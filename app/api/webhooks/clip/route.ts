import { NextResponse, type NextRequest } from 'next/server';
import { getGateway, applyPaymentEvent } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Clip Checkout notifications for menu orders. The body only names the
 * payment link; the gateway reads its state back from Clip with the
 * restaurant's credentials (the tenant is on the query string), so nothing in
 * the delivery itself is trusted.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let event;
  try {
    event = await getGateway('clip').parseWebhook({ rawBody: raw, headers: req.headers, searchParams: req.nextUrl.searchParams });
  } catch (e) {
    console.error('[clip-webhook] rejected:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const orderId = await applyPaymentEvent(event, 'clip');
    return NextResponse.json({ ok: true, type: event.type, orderId });
  } catch (e) {
    // A 500 makes Clip retry, which is what we want for a transient DB error.
    console.error('[clip-webhook] failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
