import { NextResponse, type NextRequest } from 'next/server';
import { getGateway, applyPaymentEvent } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Stripe webhook, for both the platform account and connected accounts (one
 * endpoint, "listen to events on Connected accounts" ticked in the Stripe
 * dashboard). The signature check is the whole of the trust: a body that does
 * not verify is dropped before it is even parsed.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let event;
  try {
    event = await getGateway('stripe').parseWebhook({ rawBody: raw, headers: req.headers, searchParams: req.nextUrl.searchParams });
  } catch (e) {
    console.error('[stripe-webhook] rejected:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const orderId = await applyPaymentEvent(event, 'stripe');
    return NextResponse.json({ ok: true, type: event.type, orderId });
  } catch (e) {
    // A 500 makes Stripe retry, which is what we want for a transient DB error.
    console.error('[stripe-webhook] failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
