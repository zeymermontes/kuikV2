import 'server-only';
import type { Concept } from './build';

// Facturama, multi-issuer API ("api-lite"): Kuik holds one account and pays
// per stamp; each restaurant registers its own CSD under it and issues in its
// own name. Sandbox and production differ only by host and credentials.
//
//   POST /api-lite/csds               register a restaurant's CSD
//   POST /api-lite/3/cfdis            issue a CFDI 4.0 with an explicit Issuer
//   GET  /cfdi/{pdf|xml}/issuedLite/{id}
//   DELETE /api-lite/cfdis/{id}?motive=02

export function facturamaConfigured(): boolean {
  return !!(process.env.FACTURAMA_USER && process.env.FACTURAMA_PASSWORD);
}

function base(): string {
  return process.env.FACTURAMA_SANDBOX === 'false' ? 'https://api.facturama.mx' : 'https://apisandbox.facturama.mx';
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!facturamaConfigured()) throw new Error('cfdi_not_configured');
  const auth = Buffer.from(`${process.env.FACTURAMA_USER}:${process.env.FACTURAMA_PASSWORD}`).toString('base64');
  const res = await fetch(`${base()}${path}`, {
    method,
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) throw new Error(facturamaError(json, res.status));
  return json as T;
}

/** Facturama's error bodies: { Message, ModelState: { "cfdi.Receiver.Rfc": ["..."] } } and variants. */
function facturamaError(json: unknown, status: number): string {
  const j = json as { Message?: string; message?: string; ModelState?: Record<string, string[]>; Error?: string } | null;
  const details = j?.ModelState ? Object.values(j.ModelState).flat().join(' ') : '';
  return `${j?.Message ?? j?.message ?? j?.Error ?? `PAC ${status}`}${details ? `: ${details}` : ''}`.slice(0, 500);
}

export interface Issuer {
  rfc: string;
  name: string;
  regime: string;
  zip: string;
}

export interface Receiver {
  rfc: string;
  name: string;
  regime: string;
  use: string;
  zip: string;
}

export interface StampResult {
  providerId: string;
  uuid: string;
  stampedAt: string;
}

/** Register (or replace) the restaurant's CSD; the key never touches our database. */
export async function registerCsd(input: { rfc: string; certificateB64: string; keyB64: string; password: string }): Promise<void> {
  const body = { Rfc: input.rfc, Certificate: input.certificateB64, PrivateKey: input.keyB64, PrivateKeyPassword: input.password };
  try {
    await call('POST', '/api-lite/csds', body);
  } catch (e) {
    // Already registered for this RFC: replace it.
    if (e instanceof Error && /exist|ya .*registr/i.test(e.message)) {
      await call('PUT', `/api-lite/csds/${encodeURIComponent(input.rfc)}`, body);
      return;
    }
    throw e;
  }
}

export async function stampInvoice(input: {
  issuer: Issuer;
  receiver: Receiver;
  serie: string;
  folio: number;
  paymentForm: string;
  concepts: Concept[];
  currency: string;
  global?: { periodicity: string; months: string; year: number } | null;
}): Promise<StampResult> {
  const body = {
    NameId: '1',
    CfdiType: 'I',
    Serie: input.serie,
    Folio: String(input.folio),
    ExpeditionPlace: input.issuer.zip,
    Currency: input.currency.toUpperCase(),
    PaymentForm: input.paymentForm,
    PaymentMethod: 'PUE',
    Issuer: { Rfc: input.issuer.rfc, Name: input.issuer.name, FiscalRegime: input.issuer.regime },
    Receiver: { Rfc: input.receiver.rfc, Name: input.receiver.name, FiscalRegime: input.receiver.regime, CfdiUse: input.receiver.use, TaxZipCode: input.receiver.zip },
    ...(input.global ? { GlobalInformation: { Periodicity: input.global.periodicity, Months: input.global.months, Year: input.global.year } } : {}),
    Items: input.concepts.map((c) => ({
      ProductCode: c.productCode,
      UnitCode: c.unitCode,
      Unit: 'Unidad de servicio',
      Description: c.description,
      Quantity: c.quantity,
      UnitPrice: c.unitPrice,
      Subtotal: c.subtotal,
      TaxObject: c.taxRate == null ? '01' : '02',
      ...(c.taxRate == null ? {} : { Taxes: [{ Name: 'IVA', Rate: c.taxRate, Base: c.subtotal, Total: c.tax, IsRetention: false }] }),
      Total: c.total,
    })),
  };
  const r = await call<{ Id?: string; Complement?: { TaxStamp?: { Uuid?: string; Date?: string } } }>('POST', '/api-lite/3/cfdis', body);
  if (!r.Id || !r.Complement?.TaxStamp?.Uuid) throw new Error('pac_no_stamp');
  return { providerId: r.Id, uuid: r.Complement.TaxStamp.Uuid, stampedAt: r.Complement.TaxStamp.Date ?? new Date().toISOString() };
}

/** The stamped document as bytes. */
export async function fetchDocument(providerId: string, kind: 'pdf' | 'xml'): Promise<Buffer> {
  const r = await call<{ Content?: string; ContentEncoding?: string; ContentType?: string }>('GET', `/cfdi/${kind}/issuedLite/${encodeURIComponent(providerId)}`);
  if (!r.Content) throw new Error('pac_no_content');
  return Buffer.from(r.Content, 'base64');
}

export async function cancelStamped(providerId: string, motive: '01' | '02' | '03' | '04' = '02', replacementUuid?: string): Promise<void> {
  const q = new URLSearchParams({ motive });
  if (replacementUuid) q.set('uuidReplacement', replacementUuid);
  await call('DELETE', `/api-lite/cfdis/${encodeURIComponent(providerId)}?${q}`);
}

export async function sendByEmail(providerId: string, email: string): Promise<void> {
  const q = new URLSearchParams({ cfdiType: 'issuedLite', cfdiId: providerId, email });
  await call('POST', `/Cfdi?${q}`);
}
