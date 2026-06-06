import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import { createClient } from '@/lib/supabase/server';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { formatPrice } from '@/lib/utils';
import { Card } from '@/components/ui';
import { ProUpsell } from '@/components/dashboard/ProUpsell';
import { ExportButton } from '@/components/dashboard/ExportButton';

type SalesRow = { day: string; orders: number; revenue: number };
type HourRow = { hour: number; orders: number };
type TopProduct = { product_id: string; name: string; views: number };
type TopCustomer = { name: string; phone: string; visits: number; stamps: number; points: number };

const RANGES = [7, 30, 90];

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { tenant, theme, subscription } = await requireManager();
  const t = await getTranslations('reports');

  if (!isPro(subscription)) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
        <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
        <ProUpsell feature={t('title')} />
      </div>
    );
  }

  const days = RANGES.includes(Number((await searchParams).days))
    ? Number((await searchParams).days)
    : 30;
  const currency = resolveMenuSettings(theme.settings).currency;
  const supabase = await createClient();

  const [{ data: stats }, { data: sales }, { data: hours }, { data: topP }, { data: loy }, { data: topC }] =
    await Promise.all([
      supabase.rpc('tenant_stats', { p_tenant: tenant.id, p_days: days }),
      supabase.rpc('sales_series', { p_tenant: tenant.id, p_days: days }),
      supabase.rpc('busiest_hours', { p_tenant: tenant.id, p_days: days }),
      supabase.rpc('top_products', { p_tenant: tenant.id, p_days: days, p_limit: 10 }),
      supabase.rpc('loyalty_summary', { p_tenant: tenant.id }),
      supabase.rpc('top_customers', { p_tenant: tenant.id, p_limit: 10 }),
    ]);

  const salesRows = (sales ?? []) as SalesRow[];
  const hourRows = (hours ?? []) as HourRow[];
  const topProducts = (topP ?? []) as TopProduct[];
  const topCustomers = (topC ?? []) as TopCustomer[];
  const totalRevenue = salesRows.reduce((s, r) => s + Number(r.revenue), 0);
  const stat = (stats ?? [{}])[0] as { total_views?: number; total_orders?: number };
  const loySummary = (loy ?? [{}])[0] as { members?: number; redemptions?: number };

  const maxRevenue = Math.max(1, ...salesRows.map((r) => Number(r.revenue)));
  const maxHour = Math.max(1, ...hourRows.map((r) => Number(r.orders)));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-sm text-neutral-500">{t('subtitle')}</p>
        </div>
        <div className="flex gap-1.5">
          {RANGES.map((d) => (
            <Link
              key={d}
              href={`/reports?days=${d}`}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                days === d ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
              }`}
            >
              {t('lastDays', { d })}
            </Link>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('revenue')} value={formatPrice(totalRevenue, currency)} />
        <Kpi label={t('orders')} value={String(stat.total_orders ?? 0)} />
        <Kpi label={t('views')} value={String(stat.total_views ?? 0)} />
        <Kpi label={t('members')} value={String(loySummary.members ?? 0)} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Daily sales */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">{t('dailySales')}</h2>
            <ExportButton rows={salesRows} filename={`ventas-${days}d.csv`} label={t('export')} />
          </div>
          {salesRows.length === 0 ? (
            <Empty label={t('noData')} />
          ) : (
            <div className="flex h-40 items-end gap-1">
              {salesRows.map((r) => (
                <div key={r.day} className="group flex flex-1 flex-col items-center justify-end">
                  <div
                    className="w-full rounded-t bg-neutral-900/80 transition-all group-hover:bg-neutral-900"
                    style={{ height: `${(Number(r.revenue) / maxRevenue) * 100}%` }}
                    title={`${r.day}: ${formatPrice(Number(r.revenue), currency)} · ${r.orders}`}
                  />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Busiest hours */}
        <Card>
          <h2 className="mb-3 font-semibold">{t('busiestHours')}</h2>
          {hourRows.length === 0 ? (
            <Empty label={t('noData')} />
          ) : (
            <div className="flex h-40 items-end gap-0.5">
              {Array.from({ length: 24 }).map((_, h) => {
                const row = hourRows.find((x) => x.hour === h);
                const v = row ? Number(row.orders) : 0;
                return (
                  <div key={h} className="flex flex-1 flex-col items-center justify-end">
                    <div
                      className="w-full rounded-t"
                      style={{ height: `${(v / maxHour) * 100}%`, backgroundColor: 'var(--brand-primary, #f59e0b)' }}
                      title={`${h}:00 — ${v}`}
                    />
                    {h % 6 === 0 && <span className="mt-1 text-[9px] text-neutral-400">{h}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Top products */}
        <Card>
          <h2 className="mb-3 font-semibold">{t('topProducts')}</h2>
          {topProducts.length === 0 ? (
            <Empty label={t('noData')} />
          ) : (
            <ol className="space-y-1.5">
              {topProducts.map((p, i) => (
                <li key={p.product_id} className="flex items-center justify-between text-sm">
                  <span className="truncate">
                    <span className="mr-2 text-neutral-400">{i + 1}</span>
                    {p.name}
                  </span>
                  <span className="font-medium text-neutral-500">{p.views}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* Top customers */}
        <Card>
          <h2 className="mb-3 font-semibold">{t('topCustomers')}</h2>
          {topCustomers.length === 0 ? (
            <Empty label={t('noData')} />
          ) : (
            <ol className="space-y-1.5">
              {topCustomers.map((c, i) => (
                <li key={c.phone} className="flex items-center justify-between text-sm">
                  <span className="truncate">
                    <span className="mr-2 text-neutral-400">{i + 1}</span>
                    {c.name !== '—' ? c.name : c.phone}
                  </span>
                  <span className="font-medium text-neutral-500">{t('visits', { n: c.visits })}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </Card>
  );
}

function Empty({ label }: { label: string }) {
  return <p className="py-10 text-center text-sm text-neutral-400">{label}</p>;
}
