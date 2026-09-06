import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { showDevFeatures } from '@/lib/features';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { OrdersBoard } from '@/components/dashboard/OrdersBoard';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bridgeConfigured } from '@/lib/whatsapp/bridge';
import { resolveOrderAlerts } from '@/lib/orders/alerts';
import { listOrders } from './actions';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const ctx = await requireTenant();
  const { tenant, theme } = ctx;
  // Orders is in development — super admin only.
  if (!showDevFeatures(ctx)) redirect('/menu');
  const t = await getTranslations('orders');
  const currency = resolveMenuSettings(theme.settings).currency;
  const supabase = await createClient();
  const [initial, { data: ordering }, { data: bot }] = await Promise.all([
    listOrders(),
    supabase.from('tenant_ordering').select('order_alerts').eq('tenant_id', tenant.id).maybeSingle(),
    bridgeConfigured()
      ? createAdminClient().from('whatsapp_numbers').select('id').eq('tenant_id', tenant.id).eq('status', 'connected').eq('mode', 'bridge').maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const alerts = resolveOrderAlerts((ordering as { order_alerts: unknown } | null)?.order_alerts);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <OrdersBoard initial={initial} currency={currency} tenantId={tenant.id} restaurantName={tenant.name} alerts={alerts} botConnected={!!bot} canRefund={ctx.role === 'owner' || ctx.role === 'manager'} />
    </div>
  );
}
