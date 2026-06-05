import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPreapproval } from '@/lib/mercadopago';
import type { SubscriptionStatus } from '@/lib/database.types';

// Map MercadoPago preapproval status → our subscription status.
function mapStatus(mpStatus: string | undefined): SubscriptionStatus {
  switch (mpStatus) {
    case 'authorized':
      return 'active';
    case 'paused':
      return 'past_due';
    case 'cancelled':
      return 'canceled';
    default:
      return 'trialing';
  }
}

/**
 * MercadoPago webhook. Notifications about a preapproval arrive here; we fetch
 * the authoritative state from MP and update the matching subscription
 * (mapped via external_reference = tenant_id).
 */
export async function POST(req: NextRequest) {
  // Optional shared-secret check (configured in the MP dashboard URL as ?secret=).
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (secret && req.nextUrl.searchParams.get('secret') !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let body: { type?: string; action?: string; data?: { id?: string } };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true }); // ack malformed pings
  }

  const isPreapproval =
    body.type === 'subscription_preapproval' ||
    body.action?.startsWith('subscription_preapproval');
  const preapprovalId = body.data?.id;

  if (!isPreapproval || !preapprovalId) {
    return NextResponse.json({ ok: true }); // ignore unrelated events
  }

  try {
    const pre = await getPreapproval(preapprovalId);
    const tenantId = pre.external_reference;
    if (!tenantId) return NextResponse.json({ ok: true });

    const status = mapStatus(pre.status);
    const supabase = createAdminClient();

    // When active, extend the paid period one month out (plus any granted free months).
    const update: Record<string, unknown> = {
      status,
      mp_preapproval_id: preapprovalId,
      mp_payer_email: pre.payer_email ?? null,
      updated_at: new Date().toISOString(),
    };

    if (status === 'active') {
      const next = new Date();
      next.setMonth(next.getMonth() + 1);
      update.current_period_end = next.toISOString();
    }

    await supabase.from('subscriptions').update(update).eq('tenant_id', tenantId);
  } catch {
    // Always 200 so MercadoPago doesn't hammer retries; we reconcile via cron.
  }

  return NextResponse.json({ ok: true });
}
