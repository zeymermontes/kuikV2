import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/** Public reservation request from the menu. Confirmed later by staff. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> },
) {
  const { tenantId } = await params;

  let body: {
    customer_name?: string;
    phone?: string | null;
    party_size?: number;
    date?: string;
    time?: string;
    note?: string | null;
    branch_id?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const name = (body.customer_name ?? '').trim();
  if (!name || !body.date || !body.time) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from('reservations').insert({
    tenant_id: tenantId,
    branch_id: body.branch_id ?? null,
    customer_name: name,
    phone: (body.phone ?? '').trim() || null,
    party_size: Math.min(50, Math.max(1, Number(body.party_size) || 2)),
    date: body.date,
    time: body.time,
    note: (body.note ?? '').trim() || null,
  });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });

  return NextResponse.json({ ok: true });
}
