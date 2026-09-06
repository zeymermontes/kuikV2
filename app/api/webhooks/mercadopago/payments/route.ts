import { NextResponse, type NextRequest } from 'next/server';
import { getGateway, applyPaymentEvent } from '@/lib/payments';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Mercado Pago payment notifications for menu orders (Checkout Pro on the
 * restaurants' linked accounts). Distinct from ../route.ts, which handles
 * Kuik's own subscription preapprovals. The x-signature check is the whole of
 * the trust; the tenant on the query string says whose token reads the payment.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();
  let event;
  try {
    event = await getGateway('mercadopago').parseWebhook({ rawBody: raw, headers: req.headers, searchParams: req.nextUrl.searchParams });
  } catch (e) {
    console.error('[mp-payments-webhook] rejected:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  try {
    const orderId = await applyPaymentEvent(event, 'mercadopago');
    return NextResponse.json({ ok: true, type: event.type, orderId });
  } catch (e) {
    // A 500 makes Mercado Pago retry, which is what we want for a transient DB error.
    console.error('[mp-payments-webhook] failed:', e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
