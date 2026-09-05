import { getLocale } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { isPro } from '@/lib/plan';
import { posThemeVars } from '@/lib/pos/theme';
import { themeVars } from '@/lib/theme-vars';
import type { Category, FloorTable, Printer, Product, TenantOrdering } from '@/lib/database.types';
import { PosTerminal } from '@/components/pos/PosTerminal';
import { PosLocked } from '@/components/pos/PosLocked';
import { demoAreas, demoTables } from '@/lib/host/demo';

export const dynamic = 'force-dynamic';

/** The terminal. `?demo=1` runs it against a throwaway local store for the dashboard preview. */
export default async function PosPage({ searchParams }: { searchParams: Promise<{ demo?: string; explain?: string }> }) {
  const { tenant, user, theme, subscription } = await requireTenant();
  if (!isPro(subscription)) return <PosLocked title="POS" />;
  const supabase = await createClient();
  const locale = await getLocale();
  const params = await searchParams;
  const demo = !!params.demo;
  const explain = demo && !!params.explain;

  const [{ data: categories }, { data: products }, { data: ordering }, { data: floor }, { data: areas }, { data: printers }] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('tenant_id', tenant.id)
      .is('branch_id', null)
      .eq('is_visible', true)
      .order('position'),
    supabase.from('products').select('*').eq('tenant_id', tenant.id).eq('is_hidden', false).order('position'),
    // `*` rather than a column list: a deploy that lands before migration 0065
    // is applied must still get the cash settings, with the print ones defaulting.
    supabase.from('tenant_ordering').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    // The host stand's plan, when the restaurant drew one: the POS floor map uses its tables.
    supabase.from('floor_tables').select('*').eq('tenant_id', tenant.id).order('position'),
    supabase.from('reservation_areas').select('id, name').eq('tenant_id', tenant.id).order('position'),
    supabase.from('printers').select('*').eq('tenant_id', tenant.id).eq('enabled', true).order('position'),
  ]);
  const areaName = new Map(((areas ?? []) as { id: string; name: string }[]).map((a) => [a.id, a.name]));
  let planTables = (floor ?? []) as FloorTable[];
  let planAreas = ((areas ?? []) as { id: string; name: string }[]).map((a) => ({ id: a.id, name: a.name }));
  // The demo shows the floor bridge even before the restaurant draws a plan.
  if (demo && planTables.length === 0) {
    planTables = demoTables(tenant.id);
    planAreas = demoAreas(tenant.id).map((a) => ({ id: a.id, name: a.name }));
    for (const a of planAreas) areaName.set(a.id, a.name);
  }
  const floorTables = planTables.map((x) => ({
    label: x.label,
    seats: x.seats,
    area: x.area_id ? (areaName.get(x.area_id) ?? null) : null,
  }));

  const settings = resolveMenuSettings(theme.settings);
  const currency = settings.currency;
  const cash =
    (ordering as Pick<
      TenantOrdering,
      'cash_count_mode' | 'cash_denominations' | 'pos_tables' | 'print_receipt_mode' | 'print_kitchen_auto' | 'print_drawer_cash' | 'receipt_footer' | 'note_placeholder'
    > | null) ?? null;

  return (
    <PosTerminal
      tenantId={tenant.id}
      userId={user.id}
      restaurantName={tenant.name}
      brand={{ name: tenant.name, logoUrl: theme.logo_url, slogan: theme.slogan, currency, locale }}
      currency={currency}
      locale={locale}
      cashCountMode={cash?.cash_count_mode ?? 'total'}
      cashDenominations={cash?.cash_denominations ?? null}
      posTables={cash?.pos_tables ?? 0}
      floorTables={floorTables}
      floorPlan={{ tables: planTables, areas: planAreas }}
      printers={(printers ?? []) as Printer[]}
      printSettings={{
        receiptMode: cash?.print_receipt_mode ?? 'ask',
        kitchenAuto: cash?.print_kitchen_auto ?? true,
        drawerCash: cash?.print_drawer_cash ?? true,
        footer: cash?.receipt_footer ?? null,
      }}
      notePlaceholder={cash?.note_placeholder ?? null}
      menu={{ categories: (categories ?? []) as Category[], products: (products ?? []) as Product[] }}
      // The menu's own variables too: the product sheet (options, notes) is the
      // public menu's and paints itself with `--brand-*`.
      themeStyle={{ ...themeVars(theme, settings), ...posThemeVars(theme) }}
      demo={demo}
      explain={explain}
    />
  );
}
