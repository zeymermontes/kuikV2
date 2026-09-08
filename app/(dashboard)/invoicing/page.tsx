import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { requireManager } from '@/lib/auth';
import { invoicingVisible } from '@/lib/cfdi';
import { createClient } from '@/lib/supabase/server';
import { tenantBaseUrl } from '@/lib/config';
import { cfdiConfigured } from '@/lib/cfdi';
import type { Invoice, TenantCfdi } from '@/lib/database.types';
import { InvoicingSettings } from '@/components/dashboard/InvoicingSettings';

export default async function InvoicingPage() {
  const ctx = await requireManager();
  const { tenant } = ctx;
  // Hidden until Kuik's PAC is configured (lib/cfdi invoicingVisible); dev accounts get in to set it up.
  if (!invoicingVisible(ctx)) redirect('/menu');
  const t = await getTranslations('invoicing');
  const supabase = await createClient();
  const [{ data: cfg }, { data: invoices }] = await Promise.all([
    supabase.from('tenant_cfdi').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    supabase.from('invoices').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }).limit(200),
  ]);
  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <InvoicingSettings
        settings={(cfg as TenantCfdi | null) ?? null}
        invoices={(invoices ?? []) as Invoice[]}
        pacConfigured={cfdiConfigured()}
        portalUrl={`${tenantBaseUrl(tenant.subdomain, tenant.custom_domain)}/factura`}
      />
    </div>
  );
}
