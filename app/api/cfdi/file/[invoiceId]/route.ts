import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { invoiceDocument } from '@/lib/cfdi';

/**
 * The PDF or XML of a stamped CFDI. Two ways in: a signed-in member of the
 * restaurant (the dashboard), or anyone holding the invoice id together with
 * the sale's id it was issued for (the guest who requested it from the
 * receipt; both are UUIDs, so the pair is unguessable).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(invoiceId)) return new NextResponse('Not found', { status: 404 });
  const kind = req.nextUrl.searchParams.get('kind') === 'xml' ? 'xml' : 'pdf';
  const sale = req.nextUrl.searchParams.get('sale');

  const { data } = await createAdminClient().from('invoices').select('tenant_id, order_id, tab_id').eq('id', invoiceId).maybeSingle();
  const inv = data as { tenant_id: string; order_id: string | null; tab_id: string | null } | null;
  if (!inv) return new NextResponse('Not found', { status: 404 });

  let allowed = !!sale && (sale === inv.order_id || sale === inv.tab_id);
  if (!allowed) {
    const supabase = await createClient();
    const { data: row } = await supabase.from('invoices').select('id').eq('id', invoiceId).maybeSingle();
    allowed = !!row;
  }
  if (!allowed) return new NextResponse('Forbidden', { status: 403 });

  const doc = await invoiceDocument(inv.tenant_id, invoiceId, kind);
  if (!doc) return new NextResponse('Not found', { status: 404 });
  return new NextResponse(new Uint8Array(doc.bytes), {
    headers: {
      'content-type': kind === 'pdf' ? 'application/pdf' : 'application/xml',
      'content-disposition': `attachment; filename="${doc.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
}
