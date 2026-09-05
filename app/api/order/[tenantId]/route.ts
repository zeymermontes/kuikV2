import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIp, bucketKey } from '@/lib/rate-limit';

/** Logs a WhatsApp order (analytics only — the actual order goes to WhatsApp). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;

  // This route is public, unauthenticated and writes with the service role, so
  // the limiter is the only thing standing between it and a script.
  // Order logging is analytics; a diner sending several orders in a minute is
  // plausible, a script sending hundreds is not.
  // Two buckets: one per caller, one per tenant, because a botnet defeats the
  // first but still has to land everything on the same restaurant.
  const ip = clientIp(req);
  const [byIp, byTenant] = await Promise.all([
    rateLimit(bucketKey('order:ip', `${tenantId}:${ip}`, 60), 10, 60),
    rateLimit(bucketKey('order:tenant', tenantId, 60), 200, 60),
  ]);
  if (!byIp.ok || !byTenant.ok) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  let body: {
    items?: unknown;
    total?: number | null;
    customer_name?: string | null;
    service_type?: string | null;
    table_label?: string | null;
    payment_method?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = createAdminClient();
  await supabase.from('orders').insert({
    tenant_id: tenantId,
    items: body.items,
    total: body.total ?? null,
    customer_name: body.customer_name ?? null,
    service_type: body.service_type ?? null,
    table_label: body.table_label ?? null,
    payment_method: typeof body.payment_method === 'string' ? body.payment_method.slice(0, 20) : null,
    channel: 'whatsapp',
  });

  return NextResponse.json({ ok: true });
}
