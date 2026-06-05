import { Eye, MessageCircle, TrendingUp } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui';

export default async function DashboardPage() {
  const ctx = await requireTenant();
  const t = await getTranslations('dashboard');
  const supabase = await createClient();

  const [{ data: stats }, { data: top }] = await Promise.all([
    supabase.rpc('tenant_stats', { p_tenant: ctx.tenant.id, p_days: 30 }).single<{
      total_views: number;
      total_orders: number;
    }>(),
    supabase.rpc('top_products', { p_tenant: ctx.tenant.id, p_days: 30, p_limit: 10 }),
  ]);

  const topProducts = (top ?? []) as { product_id: string; name: string; views: number }[];
  const maxViews = topProducts[0]?.views ?? 1;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('title')}</h1>

      <div className="mb-8 grid grid-cols-2 gap-4">
        <StatCard icon={Eye} label={t('totalViews')} value={stats?.total_views ?? 0} />
        <StatCard
          icon={MessageCircle}
          label={t('whatsappOrders')}
          value={stats?.total_orders ?? 0}
        />
      </div>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 font-semibold">
          <TrendingUp className="h-5 w-5 text-amber-500" />
          {t('mostVisited')}
        </h2>

        {topProducts.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-400">{t('noData')}</p>
        ) : (
          <ul className="space-y-3">
            {topProducts.map((p) => (
              <li key={p.product_id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-neutral-500">{p.views}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-amber-400"
                    style={{ width: `${Math.max(6, (p.views / maxViews) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card className="flex items-center gap-4">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100">
        <Icon className="h-5 w-5 text-neutral-700" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-neutral-500">{label}</div>
      </div>
    </Card>
  );
}
