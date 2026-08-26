import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, clientIp, bucketKey } from '@/lib/rate-limit';

/** Logs an anonymous product view for the most-visited dashboard. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;

  // This route is public, unauthenticated and writes with the service role, so
  // the limiter is the only thing standing between it and a script.
  // Product views fire on scroll, so the per-visitor budget is generous — this
  // only exists to stop someone inflating a tenant's "most viewed" report.
  // Two buckets: one per caller, one per tenant, because a botnet defeats the
  // first but still has to land everything on the same restaurant.
  const ip = clientIp(req);
  const [byIp, byTenant] = await Promise.all([
    rateLimit(bucketKey('view:ip', `${tenantId}:${ip}`, 60), 120, 60),
    rateLimit(bucketKey('view:tenant', tenantId, 60), 2000, 60),
  ]);
  if (!byIp.ok || !byTenant.ok) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }
  let productId: string | undefined;
  try {
    ({ productId } = await req.json());
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  if (!productId) return NextResponse.json({ ok: false }, { status: 400 });

  const supabase = createAdminClient();
  await supabase
    .from('product_views')
    .insert({ tenant_id: tenantId, product_id: productId });

  return NextResponse.json({ ok: true });
}
