import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Logs an anonymous product view for the most-visited dashboard. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;
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
