import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Invoice, InvoiceReceiver, OrderRow, TenantCfdi } from '@/lib/database.types';
import type { PosTab, TabItem, Payment } from '@/lib/pos/types';
import { todayInTz } from '@/lib/time';
import { showDevFeatures } from '@/lib/features';
import type { Profile } from '@/lib/database.types';
import { orderCode } from '@/lib/utils';
import { buildConcepts, globalPeriod, type SaleLine } from './build';
import { PAYMENT_FORMS, PUBLICO_EN_GENERAL, normalizeRfc, isValidZip } from './catalogs';
import { cancelStamped, facturamaConfigured, fetchDocument, sendByEmail, stampInvoice } from './facturama';

export { facturamaConfigured as cfdiConfigured } from './facturama';

// The server side of invoicing: gather a sale's lines, stamp through the PAC,
// keep the record. Runs with the admin client because the guest's own request
// (from the receipt link) has no session; every entry point checks the tenant.

export async function getCfdiSettings(tenantId: string): Promise<TenantCfdi | null> {
  const { data } = await createAdminClient().from('tenant_cfdi').select('*').eq('tenant_id', tenantId).maybeSingle();
  return (data as TenantCfdi | null) ?? null;
}

/** Ready to stamp: switched on, fiscal data complete, CSD registered, PAC configured. */
/**
 * Whether the Facturación page and its nav item show at all: only once
 * Kuik's PAC is configured, since nothing can be stamped before. Dev accounts
 * see it regardless, to set the restaurant's fiscal data up ahead of time.
 */
export function invoicingVisible(ctx: { user: { profile: Profile }; support: boolean; customerView?: boolean }): boolean {
  return facturamaConfigured() || showDevFeatures(ctx);
}

export function cfdiReady(c: TenantCfdi | null): c is TenantCfdi {
  return !!c && c.enabled && !!c.rfc && !!c.legal_name && !!c.fiscal_regime && !!c.zip_code && !!c.csd_registered_at && facturamaConfigured();
}

export interface ReceiverInput {
  rfc: string;
  name: string;
  regime: string;
  use: string;
  zip: string;
}

export function validateReceiver(r: ReceiverInput): { ok: true; receiver: InvoiceReceiver } | { ok: false; error: string } {
  const rfc = normalizeRfc(r.rfc ?? '');
  if (!rfc) return { ok: false, error: 'rfc' };
  const name = (r.name ?? '').trim().toUpperCase().slice(0, 254);
  if (name.length < 3) return { ok: false, error: 'name' };
  if (!/^\d{3}$/.test(r.regime ?? '')) return { ok: false, error: 'regime' };
  if (!/^[A-Z0-9]{2,4}$/.test(r.use ?? '')) return { ok: false, error: 'use' };
  if (!isValidZip(r.zip ?? '')) return { ok: false, error: 'zip' };
  return { ok: true, receiver: { rfc, name, regime: r.regime, use: r.use, zip: r.zip.trim() } };
}

type OrderLine = { productId?: string; name?: string; qty?: number; basePrice?: number | null; selections?: { price?: number }[] };

function linesFromOrder(o: OrderRow, codes: Map<string, { p: string | null; u: string | null }>): SaleLine[] {
  const items = (Array.isArray(o.items) ? o.items : []) as OrderLine[];
  return items.map((l) => {
    const extras = (l.selections ?? []).reduce((s, x) => s + Math.max(0, Number(x.price) || 0), 0);
    const c = l.productId ? codes.get(l.productId) : undefined;
    return { name: l.name ?? 'Producto', qty: Math.max(1, Number(l.qty) || 1), unitPrice: (Number(l.basePrice) || 0) + extras, productCode: c?.p, unitCode: c?.u };
  });
}

function linesFromTab(items: TabItem[], codes: Map<string, { p: string | null; u: string | null }>): SaleLine[] {
  return items
    .filter((i) => !i.voided_at && i.qty > 0)
    .map((i) => {
      const c = i.product_id ? codes.get(i.product_id) : undefined;
      return { name: i.name, qty: i.qty, unitPrice: i.line_total / i.qty, productCode: c?.p, unitCode: c?.u };
    });
}

async function productCodes(tenantId: string, ids: string[]): Promise<Map<string, { p: string | null; u: string | null }>> {
  if (ids.length === 0) return new Map();
  const { data } = await createAdminClient().from('products').select('id, sat_product_code, sat_unit_code').eq('tenant_id', tenantId).in('id', ids);
  return new Map(((data ?? []) as { id: string; sat_product_code: string | null; sat_unit_code: string | null }[]).map((p) => [p.id, { p: p.sat_product_code, u: p.sat_unit_code }]));
}

/** What a sale looks like to the invoice: its lines, discount, how it was paid. */
export async function saleFor(tenantId: string, ref: { orderId?: string | null; tabId?: string | null }): Promise<
  | { ok: true; lines: SaleLine[]; discount: number; paymentForm: string; total: number; invoiceId: string | null; label: string }
  | { ok: false; error: 'not_found' | 'unpaid' }
> {
  const sb = createAdminClient();
  if (ref.orderId) {
    const { data } = await sb.from('orders').select('*').eq('id', ref.orderId).eq('tenant_id', tenantId).maybeSingle();
    const o = data as OrderRow | null;
    if (!o) return { ok: false, error: 'not_found' };
    // A WhatsApp order paid at the counter is a sale too; only a checkout that never paid is not.
    if (o.payment_status === 'pending' || o.payment_status === 'failed' || o.payment_status === 'refunded') return { ok: false, error: 'unpaid' };
    const items = (Array.isArray(o.items) ? o.items : []) as OrderLine[];
    const codes = await productCodes(tenantId, items.map((l) => l.productId).filter((x): x is string => !!x));
    const lines = linesFromOrder(o, codes);
    const gross = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
    const total = Number(o.amount_paid ?? o.total ?? gross);
    return {
      ok: true,
      lines,
      discount: Number(o.discount ?? 0),
      paymentForm: PAYMENT_FORMS[o.payment_method ?? ''] ?? '99',
      total,
      invoiceId: o.invoice_id,
      label: `Pedido ${orderCode(o.id)}`,
    };
  }
  if (ref.tabId) {
    const [{ data: tab }, { data: items }, { data: pays }] = await Promise.all([
      sb.from('tabs').select('*').eq('id', ref.tabId).eq('tenant_id', tenantId).maybeSingle(),
      sb.from('tab_items').select('*').eq('tab_id', ref.tabId),
      sb.from('payments').select('*').eq('tab_id', ref.tabId),
    ]);
    const t = tab as PosTab | null;
    if (!t) return { ok: false, error: 'not_found' };
    if (t.status !== 'paid') return { ok: false, error: 'unpaid' };
    const its = (items ?? []) as TabItem[];
    const codes = await productCodes(tenantId, its.map((i) => i.product_id).filter((x): x is string => !!x));
    const byMethod = new Map<string, number>();
    for (const p of (pays ?? []) as Payment[]) if (p.kind !== 'refund') byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
    const top = [...byMethod.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'cash';
    return {
      ok: true,
      lines: linesFromTab(its, codes),
      discount: Number(t.discount ?? 0) + Number(t.promo_discount ?? 0),
      paymentForm: PAYMENT_FORMS[top] ?? '99',
      total: Number(t.total) - Number(t.refunded ?? 0),
      invoiceId: t.invoice_id,
      label: `Venta ${orderCode(t.id)}${t.table_label ? ` · ${t.table_label}` : ''}`,
    };
  }
  return { ok: false, error: 'not_found' };
}

export type IssueError = 'not_ready' | 'not_found' | 'unpaid' | 'already' | 'in_global' | 'empty' | 'pac';

/** Stamp a CFDI for one sale, in the restaurant's name, to the receiver given. */
export async function issueInvoice(input: {
  tenantId: string;
  orderId?: string | null;
  tabId?: string | null;
  receiver: InvoiceReceiver;
  email?: string | null;
  requestedBy: 'guest' | 'staff';
}): Promise<{ ok: true; invoice: Invoice } | { ok: false; error: IssueError; detail?: string }> {
  const sb = createAdminClient();
  const cfg = await getCfdiSettings(input.tenantId);
  if (!cfdiReady(cfg)) return { ok: false, error: 'not_ready' };
  const sale = await saleFor(input.tenantId, input);
  if (!sale.ok) return { ok: false, error: sale.error };
  if (sale.invoiceId) {
    const { data: prev } = await sb.from('invoices').select('kind, status').eq('id', sale.invoiceId).maybeSingle();
    const p = prev as { kind: string; status: string } | null;
    if (p && p.status === 'stamped') return { ok: false, error: p.kind === 'global' ? 'in_global' : 'already' };
  }
  const totals = buildConcepts(sale.lines, { ivaPercent: Number(cfg.iva_percent), discount: sale.discount, productCode: cfg.product_code, unitCode: cfg.unit_code });
  if (totals.concepts.length === 0 || totals.total <= 0) return { ok: false, error: 'empty' };

  const { data: folioRow } = await sb.rpc('next_invoice_folio', { p_tenant: input.tenantId });
  const folio = Number(folioRow ?? 0) || 1;
  const { data: created } = await sb
    .from('invoices')
    .insert({
      tenant_id: input.tenantId,
      order_id: input.orderId ?? null,
      tab_id: input.tabId ?? null,
      kind: 'ingreso',
      status: 'pending',
      serie: cfg.serie,
      folio,
      receiver: input.receiver,
      items: totals.concepts,
      payment_form: sale.paymentForm,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      email: input.email ?? null,
      requested_by: input.requestedBy,
    })
    .select('*')
    .maybeSingle();
  const inv = created as Invoice | null;
  if (!inv) return { ok: false, error: 'already' };

  try {
    const stamp = await stampInvoice({
      issuer: { rfc: cfg.rfc!, name: cfg.legal_name!, regime: cfg.fiscal_regime!, zip: cfg.zip_code! },
      receiver: input.receiver,
      serie: cfg.serie,
      folio,
      paymentForm: sale.paymentForm,
      concepts: totals.concepts,
      currency: 'MXN',
    });
    const { data: updated } = await sb
      .from('invoices')
      .update({ status: 'stamped', uuid: stamp.uuid, provider_id: stamp.providerId, stamped_at: stamp.stampedAt })
      .eq('id', inv.id)
      .select('*')
      .maybeSingle();
    if (input.orderId) await sb.from('orders').update({ invoice_id: inv.id }).eq('id', input.orderId);
    if (input.tabId) await sb.from('tabs').update({ invoice_id: inv.id }).eq('id', input.tabId);
    if (input.email) sendByEmail(stamp.providerId, input.email).catch(() => {});
    return { ok: true, invoice: (updated as Invoice) ?? inv };
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'pac';
    await sb.from('invoices').update({ status: 'error', error: detail }).eq('id', inv.id);
    return { ok: false, error: 'pac', detail };
  }
}

/**
 * The day's global CFDI: one concept per sale that has no invoice of its own,
 * to "PÚBLICO EN GENERAL". Sales included are marked so a guest asking later
 * learns they are on the global one.
 */
export async function issueGlobalInvoice(tenantId: string, date?: string): Promise<{ ok: true; invoice: Invoice; count: number } | { ok: false; error: IssueError; detail?: string }> {
  const sb = createAdminClient();
  const cfg = await getCfdiSettings(tenantId);
  if (!cfdiReady(cfg)) return { ok: false, error: 'not_ready' };
  const { data: tenant } = await sb.from('tenants').select('timezone').eq('id', tenantId).maybeSingle();
  const tz = (tenant as { timezone: string | null } | null)?.timezone ?? null;
  const day = date ?? todayInTz(tz);
  // The day's bounds in the restaurant's zone, as UTC instants.
  const startLocal = new Date(`${day}T00:00:00`);
  const offsetMs = (await import('@/lib/time')).tzOffsetMs(startLocal, tz);
  const from = new Date(Date.UTC(startLocal.getFullYear(), startLocal.getMonth(), startLocal.getDate()) - offsetMs).toISOString();
  const to = new Date(new Date(from).getTime() + 24 * 3600_000).toISOString();

  const [{ data: tabs }, { data: orders }] = await Promise.all([
    sb.from('tabs').select('id, total, refunded, closed_at').eq('tenant_id', tenantId).eq('status', 'paid').is('invoice_id', null).gte('closed_at', from).lt('closed_at', to),
    sb.from('orders').select('id, total, amount_paid, payment_status, status, created_at').eq('tenant_id', tenantId).is('invoice_id', null).eq('payment_status', 'paid').gte('created_at', from).lt('created_at', to),
  ]);
  const sales: { kind: 'tab' | 'order'; id: string; amount: number }[] = [
    ...((tabs ?? []) as { id: string; total: number; refunded: number }[]).map((t) => ({ kind: 'tab' as const, id: t.id, amount: Number(t.total) - Number(t.refunded ?? 0) })),
    ...((orders ?? []) as { id: string; total: number | null; amount_paid: number | null }[]).map((o) => ({ kind: 'order' as const, id: o.id, amount: Number(o.amount_paid ?? o.total ?? 0) })),
  ].filter((s) => s.amount > 0);
  if (sales.length === 0) return { ok: false, error: 'empty' };

  const totals = buildConcepts(
    sales.map((s) => ({ name: `Venta ${orderCode(s.id)}`, qty: 1, unitPrice: s.amount, productCode: '01010101', unitCode: 'ACT' })),
    { ivaPercent: Number(cfg.iva_percent), productCode: '01010101', unitCode: 'ACT' },
  );
  const receiver: InvoiceReceiver = { rfc: PUBLICO_EN_GENERAL.rfc, name: PUBLICO_EN_GENERAL.name, regime: PUBLICO_EN_GENERAL.regime, use: PUBLICO_EN_GENERAL.use, zip: cfg.zip_code! };
  const { data: folioRow } = await sb.rpc('next_invoice_folio', { p_tenant: tenantId });
  const folio = Number(folioRow ?? 0) || 1;
  const { data: created } = await sb
    .from('invoices')
    .insert({
      tenant_id: tenantId,
      kind: 'global',
      period_date: day,
      status: 'pending',
      serie: cfg.serie,
      folio,
      receiver,
      items: { concepts: totals.concepts, sales },
      payment_form: '01',
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      requested_by: 'staff',
    })
    .select('*')
    .maybeSingle();
  const inv = created as Invoice | null;
  if (!inv) return { ok: false, error: 'pac', detail: 'insert' };
  try {
    const stamp = await stampInvoice({
      issuer: { rfc: cfg.rfc!, name: cfg.legal_name!, regime: cfg.fiscal_regime!, zip: cfg.zip_code! },
      receiver,
      serie: cfg.serie,
      folio,
      paymentForm: '01',
      concepts: totals.concepts,
      currency: 'MXN',
      global: globalPeriod(day),
    });
    const { data: updated } = await sb
      .from('invoices')
      .update({ status: 'stamped', uuid: stamp.uuid, provider_id: stamp.providerId, stamped_at: stamp.stampedAt })
      .eq('id', inv.id)
      .select('*')
      .maybeSingle();
    const tabIds = sales.filter((s) => s.kind === 'tab').map((s) => s.id);
    const orderIds = sales.filter((s) => s.kind === 'order').map((s) => s.id);
    if (tabIds.length) await sb.from('tabs').update({ invoice_id: inv.id }).in('id', tabIds);
    if (orderIds.length) await sb.from('orders').update({ invoice_id: inv.id }).in('id', orderIds);
    return { ok: true, invoice: (updated as Invoice) ?? inv, count: sales.length };
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'pac';
    await sb.from('invoices').update({ status: 'error', error: detail }).eq('id', inv.id);
    return { ok: false, error: 'pac', detail };
  }
}

export async function cancelInvoice(tenantId: string, invoiceId: string): Promise<{ ok: boolean; error?: string }> {
  const sb = createAdminClient();
  const { data } = await sb.from('invoices').select('*').eq('id', invoiceId).eq('tenant_id', tenantId).maybeSingle();
  const inv = data as Invoice | null;
  if (!inv || inv.status !== 'stamped' || !inv.provider_id) return { ok: false, error: 'not_stamped' };
  try {
    await cancelStamped(inv.provider_id, '02');
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'pac' };
  }
  await sb.from('invoices').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', inv.id);
  // The sales are free to be invoiced again.
  await sb.from('orders').update({ invoice_id: null }).eq('invoice_id', inv.id);
  await sb.from('tabs').update({ invoice_id: null }).eq('invoice_id', inv.id);
  return { ok: true };
}

/** The stamped PDF or XML, for a download route. */
export async function invoiceDocument(tenantId: string, invoiceId: string, kind: 'pdf' | 'xml'): Promise<{ bytes: Buffer; filename: string } | null> {
  const { data } = await createAdminClient().from('invoices').select('provider_id, status, serie, folio, uuid').eq('id', invoiceId).eq('tenant_id', tenantId).maybeSingle();
  const inv = data as { provider_id: string | null; status: string; serie: string | null; folio: number | null; uuid: string | null } | null;
  if (!inv?.provider_id || inv.status === 'pending' || inv.status === 'error') return null;
  const bytes = await fetchDocument(inv.provider_id, kind);
  return { bytes, filename: `${inv.serie ?? 'F'}${inv.folio ?? ''}-${(inv.uuid ?? invoiceId).slice(0, 8)}.${kind}` };
}
