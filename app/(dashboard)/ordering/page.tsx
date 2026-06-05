import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TenantOrdering } from '@/lib/database.types';
import { OrderingForm } from '@/components/dashboard/OrderingForm';

export default async function OrderingPage() {
  const { tenant } = await requireTenant();
  const t = await getTranslations('ordering');
  const supabase = await createClient();

  const { data } = await supabase
    .from('tenant_ordering')
    .select('*')
    .eq('tenant_id', tenant.id)
    .maybeSingle<TenantOrdering>();

  const ordering: TenantOrdering = data ?? {
    tenant_id: tenant.id,
    ordering_enabled: true,
    service_types: ['pickup'],
    order_header: null,
    min_order: null,
    delivery_fee: null,
    free_delivery_over: null,
    tips: [],
    collect_address: false,
    collect_pickup_time: false,
    collect_table: false,
    updated_at: new Date(0).toISOString(),
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <OrderingForm ordering={ordering} />
    </div>
  );
}
