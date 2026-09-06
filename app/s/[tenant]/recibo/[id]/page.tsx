import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTenantByHostKey } from '@/lib/tenant';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { tenantBaseUrl } from '@/lib/config';
import type { OrderRow } from '@/lib/database.types';
import { Receipt } from '@/components/menu/Receipt';

type Params = { tenant: string; id: string };

// A receipt changes when the webhook lands; never serve a stale one.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The receipt of one order, reachable by anyone holding its id (a UUID) — the guest's QR, the counter's scan. */
export default async function ReceiptPage({ params }: { params: Promise<Params> }) {
  const { tenant: hostKey, id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await getTenantByHostKey(decodeURIComponent(hostKey));
  if (!data) notFound();
  const { data: order } = await createAdminClient().from('orders').select('*').eq('id', id).eq('tenant_id', data.tenant.id).maybeSingle();
  if (!order) notFound();
  const locale = data.tenant.locale === 'en' ? 'en-US' : 'es-MX';
  return (
    <Receipt
      restaurant={data.tenant.name}
      logoUrl={data.theme.logo_url}
      order={order as OrderRow}
      currency={resolveMenuSettings(data.theme.settings).currency}
      locale={locale}
      url={`${tenantBaseUrl(data.tenant.subdomain, data.tenant.custom_domain)}/recibo/${id}`}
    />
  );
}
