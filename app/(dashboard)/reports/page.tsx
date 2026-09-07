import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import { createClient } from '@/lib/supabase/server';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { formatPrice, daysAgoISO } from '@/lib/utils';
import { entryMinutes } from '@/lib/employees';
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
  searchParams: Promise<{ days?: string; branch?: string }>;
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

  const sp = await searchParams;
  const days = RANGES.includes(Number(sp.days)) ? Number(sp.days) : 30;
  const currency = resolveMenuSettings(theme.settings).currency;
  const supabase = await createClient();

  // `?branch=`: one location, or every one. Tabs, payments and online orders
  // carry the branch since 0083; earlier rows count as the main location.
  const { data: branchRows } = await supabase.from('branches').select('id, name').eq('tenant_id', tenant.id).order('position');
  const branches = (branchRows ?? []) as { id: string; name: string }[];
  const branchParam = sp.branch ?? '';
  const branchId = branches.some((b) => b.id === branchParam) ? branchParam : null;
  const mainOnly = branchParam === 'main';
  const byBranch = <Q,>(q: Q): Q => {
    // A structural cast, not a generic constraint: the builder's own generics blow up type instantiation.
    const b = q as unknown as { eq: (c: string, v: string) => Q; is: (c: string, v: null) => Q };
    return branchId ? b.eq('branch_id', branchId) : mainOnly ? b.is('branch_id', null) : q;
  };
  const withBranch = (p: string) => (branchId ? `${p}&branch=${branchId}` : mainOnly ? `${p}&branch=main` : p);

  const [{ data: stats }, { data: sales }, { data: hours }, { data: topP }, { data: loy }, { data: topC }] =
    await Promise.all([
      supabase.rpc('tenant_stats', { p_tenant: tenant.id, p_days: days, p_branch: branchId }),
      supabase.rpc('sales_series', { p_tenant: tenant.id, p_days: days, p_branch: branchId }),
      supabase.rpc('busiest_hours', { p_tenant: tenant.id, p_days: days, p_branch: branchId }),
      supabase.rpc('top_products', { p_tenant: tenant.id, p_days: days, p_limit: 10 }),
      supabase.rpc('loyalty_summary', { p_tenant: tenant.id }),
      supabase.rpc('top_customers', { p_tenant: tenant.id, p_limit: 10 }),
    ]);

  // What the WhatsApp bot handled on its own in the same window.
  const botSince = daysAgoISO(days);
  const [{ count: botRuns }, { count: botReservations }] = await Promise.all([
    supabase
      .from('whatsapp_flow_runs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .gte('started_at', botSince),
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .eq('source', 'bot')
      .gte('created_at', botSince),
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

  // ── Profitability (logged orders × per-product cost) ──────────────────────
  const since = daysAgoISO(days);
  const [{ data: orderRows }, { data: prodRows }] = await Promise.all([
    byBranch(supabase.from('orders').select('items').eq('tenant_id', tenant.id)).gte('created_at', since),
    supabase.from('products').select('id, name, cost').eq('tenant_id', tenant.id),
  ]);
  const costById = new Map(
    ((prodRows ?? []) as { id: string; name: string; cost: number | null }[]).map((p) => [p.id, p]),
  );
  type Line = { productId?: string; qty?: number; basePrice?: number | null; selections?: { price?: number }[] };
  const perProduct = new Map<string, { name: string; units: number; revenue: number; cost: number }>();
  let pRevenue = 0;
  let pCost = 0;
  for (const o of (orderRows ?? []) as { items: Line[] }[]) {
    for (const l of o.items ?? []) {
      if (!l.productId) continue;
      const qty = Number(l.qty) || 0;
      const extras = (l.selections ?? []).reduce((s, x) => s + (Number(x.price) || 0), 0);
      const rev = ((Number(l.basePrice) || 0) + extras) * qty;
      const prod = costById.get(l.productId);
      const cost = (Number(prod?.cost) || 0) * qty;
      pRevenue += rev;
      pCost += cost;
      const cur = perProduct.get(l.productId) ?? { name: prod?.name ?? '—', units: 0, revenue: 0, cost: 0 };
      cur.units += qty;
      cur.revenue += rev;
      cur.cost += cost;
      perProduct.set(l.productId, cur);
    }
  }
  const pProfit = pRevenue - pCost;
  const pMargin = pRevenue > 0 ? (pProfit / pRevenue) * 100 : 0;
  const topProfit = [...perProduct.values()]
    .map((p) => ({ ...p, profit: p.revenue - p.cost }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  // ── By employee: hours on the clock, tabs closed, tips (POS, same window) ──
  const [{ data: empRows }, { data: clockRows }, { data: tabRows }, { data: payRows }] = await Promise.all([
    supabase.from('employees').select('id, name, role').eq('tenant_id', tenant.id),
    supabase.from('time_entries').select('employee_id, clock_in, clock_out').eq('tenant_id', tenant.id).gte('clock_in', since),
    byBranch(supabase.from('tabs').select('employee_id, total').eq('tenant_id', tenant.id)).eq('status', 'paid').not('employee_id', 'is', null).gte('closed_at', since),
    byBranch(supabase.from('payments').select('employee_id, tip').eq('tenant_id', tenant.id)).not('employee_id', 'is', null).gte('created_at', since),
  ]);
  const byEmployee = new Map<string, { name: string; minutes: number; tabs: number; sales: number; tips: number }>();
  for (const e of (empRows ?? []) as { id: string; name: string }[]) byEmployee.set(e.id, { name: e.name, minutes: 0, tabs: 0, sales: 0, tips: 0 });
  for (const c of (clockRows ?? []) as { employee_id: string; clock_in: string; clock_out: string | null }[]) {
    const row = byEmployee.get(c.employee_id);
    if (row) row.minutes += entryMinutes(c);
  }
  for (const tb of (tabRows ?? []) as { employee_id: string; total: number }[]) {
    const row = byEmployee.get(tb.employee_id);
    if (row) {
      row.tabs += 1;
      row.sales += Number(tb.total) || 0;
    }
  }
  for (const p of (payRows ?? []) as { employee_id: string; tip: number }[]) {
    const row = byEmployee.get(p.employee_id);
    if (row) row.tips += Number(p.tip) || 0;
  }
  const employeeRows = [...byEmployee.values()].filter((r) => r.minutes || r.tabs || r.tips).sort((a, b) => b.sales - a.sales);

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
              href={withBranch(`/reports?days=${d}`)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                days === d ? 'bg-neutral-900 text-white' : 'border border-neutral-300 text-neutral-600'
              }`}
            >
              {t('lastDays', { d })}
            </Link>
          ))}
          {branches.length > 0 && (

            <span className="ml-3 inline-flex flex-wrap gap-1">

              {[{ id: '', name: t('allBranches') }, { id: 'main', name: t('mainLocation') }, ...branches].map((b) => (

                <Link

                  key={b.id || 'all'}

                  href={b.id ? `/reports?days=${days}&branch=${b.id}` : `/reports?days=${days}`}

                  className={`rounded-full px-3 py-1 text-xs font-medium ${

                    (b.id === '' && !branchId && !mainOnly) || (b.id === 'main' && mainOnly) || (b.id !== '' && b.id === branchId)

                      ? 'bg-neutral-900 text-white'

                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'

                  }`}

                >

                  {b.name}

                </Link>

              ))}

            </span>

          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label={t('revenue')} value={formatPrice(totalRevenue, currency)} />
        <Kpi label={t('orders')} value={String(stat.total_orders ?? 0)} />
        <Kpi label={t('views')} value={String(stat.total_views ?? 0)} />
        <Kpi label={t('members')} value={String(loySummary.members ?? 0)} />
        <Kpi label={t('profit')} value={formatPrice(pProfit, currency)} />
        <Kpi label={t('margin')} value={`${Math.round(pMargin)}%`} />
        <Kpi label={t('botConversations')} value={String(botRuns ?? 0)} />
        <Kpi label={t('botReservations')} value={String(botReservations ?? 0)} />
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

        {/* Profitability by product */}
        <Card>
          <h2 className="mb-3 font-semibold">{t('profitByProduct')}</h2>
          {topProfit.length === 0 ? (
            <Empty label={t('noCostData')} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-neutral-400">
                  <th className="pb-1 font-medium">{t('product')}</th>
                  <th className="pb-1 text-right font-medium">{t('units')}</th>
                  <th className="pb-1 text-right font-medium">{t('profit')}</th>
                  <th className="pb-1 text-right font-medium">{t('margin')}</th>
                </tr>
              </thead>
              <tbody>
                {topProfit.map((p, i) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="truncate py-1.5">{p.name}</td>
                    <td className="py-1.5 text-right text-neutral-500">{p.units}</td>
                    <td className="py-1.5 text-right font-medium">{formatPrice(p.profit, currency)}</td>
                    <td className="py-1.5 text-right text-neutral-500">
                      {p.revenue > 0 ? Math.round((p.profit / p.revenue) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Employees */}
        {employeeRows.length > 0 && (
          <Card>
            <h2 className="mb-3 font-semibold">{t('employees')}</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-neutral-500">
                <tr>
                  <th className="pb-1.5 font-medium">{t('employees')}</th>
                  <th className="pb-1.5 text-right font-medium">{t('empHours')}</th>
                  <th className="pb-1.5 text-right font-medium">{t('empSales')}</th>
                  <th className="pb-1.5 text-right font-medium">{t('empTips')}</th>
                </tr>
              </thead>
              <tbody>
                {employeeRows.map((r) => (
                  <tr key={r.name} className="border-t border-neutral-100">
                    <td className="py-1.5">
                      <span className="block truncate">{r.name}</span>
                      <span className="text-xs text-neutral-400">{t('empSalesCount', { n: r.tabs })}</span>
                    </td>
                    <td className="py-1.5 text-right text-neutral-500">{(r.minutes / 60).toFixed(1)}</td>
                    <td className="py-1.5 text-right font-medium">{formatPrice(r.sales, currency)}</td>
                    <td className="py-1.5 text-right text-neutral-500">{formatPrice(r.tips, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}

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
