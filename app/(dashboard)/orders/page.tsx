import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { OrdersBoard } from '@/components/dashboard/OrdersBoard';
import { listOrders } from './actions';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const { tenant, theme } = await requireTenant();
  const t = await getTranslations('orders');
  const currency = resolveMenuSettings(theme.settings).currency;
  const initial = await listOrders();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <OrdersBoard initial={initial} currency={currency} tenantId={tenant.id} />
    </div>
  );
}
