import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantByHostKey } from '@/lib/tenant';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { SelfInvoice } from '@/components/menu/SelfInvoice';

type Params = { tenant: string };

// Personal to whoever holds the sale id; never a page for search engines.
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The guest's invoice request page: tacos.kuik.mx/factura?o=<order> or ?t=<sale>. */
export default async function SelfInvoicePage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<{ o?: string; t?: string }> }) {
  const { tenant: hostKey } = await params;
  const { o, t } = await searchParams;
  const data = await getTenantByHostKey(decodeURIComponent(hostKey));
  if (!data) notFound();
  const id = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
  return (
    <SelfInvoice
      tenantId={data.tenant.id}
      restaurant={data.tenant.name}
      orderId={id(o)}
      tabId={id(t)}
      currency={resolveMenuSettings(data.theme.settings).currency}
      locale={data.tenant.locale === 'en' ? 'en-US' : 'es-MX'}
    />
  );
}
