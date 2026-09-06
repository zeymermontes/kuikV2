'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { revalidateTenant } from '@/lib/revalidate';
import { normalizeRfc, isValidZip } from '@/lib/cfdi/catalogs';
import { registerCsd } from '@/lib/cfdi/facturama';
import { cancelInvoice, issueGlobalInvoice, issueInvoice, validateReceiver, type ReceiverInput } from '@/lib/cfdi';

export interface CfdiSettingsInput {
  enabled: boolean;
  rfc: string;
  legal_name: string;
  fiscal_regime: string;
  zip_code: string;
  iva_percent: number;
  serie: string;
  product_code: string;
  unit_code: string;
  self_invoice: boolean;
  global_daily: boolean;
}

export async function saveCfdiSettings(input: CfdiSettingsInput): Promise<{ error?: string }> {
  const { tenant } = await requireManager();
  const rfc = input.rfc ? normalizeRfc(input.rfc) : null;
  if (input.rfc && !rfc) return { error: 'rfc' };
  if (input.zip_code && !isValidZip(input.zip_code)) return { error: 'zip' };
  const iva = [0, 8, 16].includes(Number(input.iva_percent)) ? Number(input.iva_percent) : 16;
  const supabase = await createClient();
  const { error } = await supabase.from('tenant_cfdi').upsert(
    {
      tenant_id: tenant.id,
      enabled: !!input.enabled,
      rfc,
      legal_name: input.legal_name.trim().toUpperCase().slice(0, 254) || null,
      fiscal_regime: /^\d{3}$/.test(input.fiscal_regime) ? input.fiscal_regime : null,
      zip_code: input.zip_code.trim() || null,
      iva_percent: iva,
      serie: input.serie.trim().toUpperCase().slice(0, 10) || 'A',
      product_code: /^\d{8}$/.test(input.product_code) ? input.product_code : '90101500',
      unit_code: /^[A-Z0-9]{2,3}$/.test(input.unit_code.toUpperCase()) ? input.unit_code.toUpperCase() : 'E48',
      self_invoice: !!input.self_invoice,
      global_daily: !!input.global_daily,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id' },
  );
  if (error) return { error: error.message };
  revalidatePath('/invoicing');
  revalidateTenant(tenant.subdomain, tenant.custom_domain);
  return {};
}

/** Upload the CSD (.cer + .key + password) to the PAC. Nothing of it is kept here but the fact that it is registered. */
export async function uploadCsd(form: FormData): Promise<{ error?: string }> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const { data } = await supabase.from('tenant_cfdi').select('rfc').eq('tenant_id', tenant.id).maybeSingle();
  const rfc = (data as { rfc: string | null } | null)?.rfc;
  if (!rfc) return { error: 'rfc_first' };
  const cer = form.get('cer');
  const key = form.get('key');
  const password = String(form.get('password') ?? '');
  if (!(cer instanceof File) || !(key instanceof File) || !password) return { error: 'files' };
  if (cer.size > 20_000 || key.size > 20_000) return { error: 'files' };
  try {
    await registerCsd({
      rfc,
      certificateB64: Buffer.from(await cer.arrayBuffer()).toString('base64'),
      keyB64: Buffer.from(await key.arrayBuffer()).toString('base64'),
      password,
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'pac' };
  }
  await supabase.from('tenant_cfdi').update({ csd_registered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('tenant_id', tenant.id);
  revalidatePath('/invoicing');
  return {};
}

/** Stamp a CFDI for a sale from the dashboard. */
export async function issueForSale(ref: { orderId?: string; tabId?: string }, receiver: ReceiverInput, email: string | null): Promise<{ error?: string; detail?: string }> {
  const { tenant } = await requireManager();
  const v = validateReceiver(receiver);
  if (!v.ok) return { error: v.error };
  const r = await issueInvoice({ tenantId: tenant.id, orderId: ref.orderId, tabId: ref.tabId, receiver: v.receiver, email, requestedBy: 'staff' });
  revalidatePath('/invoicing');
  return r.ok ? {} : { error: r.error, detail: r.detail };
}

export async function issueGlobal(date: string): Promise<{ error?: string; detail?: string; count?: number }> {
  const { tenant } = await requireManager();
  const r = await issueGlobalInvoice(tenant.id, /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined);
  revalidatePath('/invoicing');
  return r.ok ? { count: r.count } : { error: r.error, detail: r.detail };
}

export async function cancelOne(invoiceId: string): Promise<{ error?: string }> {
  const { tenant } = await requireManager();
  const r = await cancelInvoice(tenant.id, invoiceId);
  revalidatePath('/invoicing');
  return r.ok ? {} : { error: r.error };
}
