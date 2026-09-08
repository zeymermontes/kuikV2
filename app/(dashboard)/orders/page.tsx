import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { OrdersBoard } from '@/components/dashboard/OrdersBoard';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { bridgeConfigured } from '@/lib/whatsapp/bridge';
import { resolveOrderAlerts } from '@/lib/orders/alerts';
import { listOrders, enableOrdersBoard } from './actions';
import { ClipboardList } from 'lucide-react';
import { ordersBoardEnabled } from '@/lib/orders/board';

export const dynamic = 'force-dynamic';

export default async function OrdersPage() {
  const ctx = await requireTenant();
  const { tenant, theme } = ctx;
  const t = await getTranslations('orders');
  // The board is switched on per restaurant (0085): off, the page is where
  // an owner or manager turns it on, and everyone else learns who can.
  if (!(await ordersBoardEnabled(tenant.id))) {
    const canSwitch = ctx.role === 'owner' || ctx.role === 'manager';
    return (
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
        <div className="mt-6 max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 text-center">
          <ClipboardList className="mx-auto h-8 w-8 text-neutral-300" />
          <p className="mt-3 font-semibold">{t('boardOffTitle')}</p>
          <p className="mt-2 text-sm text-neutral-600">{t('boardOffBody')}</p>
          {canSwitch ? (
            <form action={enableOrdersBoard} className="mt-5">
              <button className="rounded-xl bg-neutral-900 px-5 py-2.5 text-sm font-semibold text-white">{t('boardOn')}</button>
            </form>
          ) : (
            <p className="mt-4 text-sm text-neutral-500">{t('boardOffAsk')}</p>
          )}
        </div>
      </div>
    );
  }
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
