import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Logs a WhatsApp order (analytics only — the actual order goes to WhatsApp). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;

  let body: {
    items?: unknown;
    total?: number | null;
    customer_name?: string | null;
    service_type?: string | null;
    table_label?: string | null;
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
    channel: 'whatsapp',
  });

  return NextResponse.json({ ok: true });
}
