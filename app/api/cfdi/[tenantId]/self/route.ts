import { NextResponse, type NextRequest } from 'next/server';
import { rateLimit, clientIp, bucketKey } from '@/lib/rate-limit';
import { getCfdiSettings, cfdiReady, issueInvoice, saleFor, validateReceiver } from '@/lib/cfdi';

/**
 * A guest requesting the CFDI of their own sale, from the receipt's link.
 * Public and unauthenticated: the sale id (a UUID) is the proof of purchase.
 *   GET  ?o=<orderId> | ?t=<tabId>   what would be invoiced (or why not)
 *   POST { orderId | tabId, receiver, email }   stamp it
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const orderId = req.nextUrl.searchParams.get('o');
  const tabId = req.nextUrl.searchParams.get('t');
  const cfg = await getCfdiSettings(tenantId);
  if (!cfdiReady(cfg) || !cfg.self_invoice) return NextResponse.json({ ok: false, error: 'not_available' }, { status: 404 });
  const sale = await saleFor(tenantId, { orderId, tabId });
  if (!sale.ok) return NextResponse.json({ ok: false, error: sale.error }, { status: 404 });
  if (sale.invoiceId) return NextResponse.json({ ok: false, error: 'already', invoiceId: sale.invoiceId });
  return NextResponse.json({ ok: true, label: sale.label, total: sale.total, issuer: cfg.legal_name });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  const ip = clientIp(req);
  const [byIp, byTenant] = await Promise.all([rateLimit(bucketKey('cfdi:ip', `${tenantId}:${ip}`, 3600), 10, 3600), rateLimit(bucketKey('cfdi:tenant', tenantId, 3600), 300, 3600)]);
  if (!byIp.ok || !byTenant.ok) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });

  let body: { orderId?: string; tabId?: string; receiver?: Record<string, string>; email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  const ref = { orderId: body.orderId && /^[0-9a-f-]{36}$/i.test(body.orderId) ? body.orderId : null, tabId: body.tabId && /^[0-9a-f-]{36}$/i.test(body.tabId) ? body.tabId : null };
  if (!ref.orderId && !ref.tabId) return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });

  const cfg = await getCfdiSettings(tenantId);
  if (!cfdiReady(cfg) || !cfg.self_invoice) return NextResponse.json({ ok: false, error: 'not_available' }, { status: 404 });
  const v = validateReceiver({
    rfc: body.receiver?.rfc ?? '',
    name: body.receiver?.name ?? '',
    regime: body.receiver?.regime ?? '',
    use: body.receiver?.use ?? '',
    zip: body.receiver?.zip ?? '',
  });
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  const email = body.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email) ? body.email.slice(0, 254) : null;

  const r = await issueInvoice({ tenantId, orderId: ref.orderId, tabId: ref.tabId, receiver: v.receiver, email, requestedBy: 'guest' });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error, detail: r.detail }, { status: r.error === 'pac' ? 502 : 409 });
  const saleId = ref.orderId ?? ref.tabId!;
  return NextResponse.json({
    ok: true,
    invoiceId: r.invoice.id,
    uuid: r.invoice.uuid,
    folio: `${r.invoice.serie ?? ''}${r.invoice.folio ?? ''}`,
    pdf: `/api/cfdi/file/${r.invoice.id}?kind=pdf&sale=${saleId}`,
    xml: `/api/cfdi/file/${r.invoice.id}?kind=xml&sale=${saleId}`,
  });
}
