import { getLocale } from 'next-intl/server';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { posThemeVars } from '@/lib/pos/theme';
import { themeVars } from '@/lib/theme-vars';
import { demoAreas, demoTables } from '@/lib/host/demo';
import { DEMO_TENANT, DEMO_THEME } from '@/lib/demo-tenant';
import { PosTerminal } from '@/components/pos/PosTerminal';

export const dynamic = 'force-dynamic';

/** The register, on the sample menu and floor, with no account behind it. */
export default async function DemoPosPage({ searchParams }: { searchParams: Promise<{ explain?: string }> }) {
  const locale = await getLocale();
  const { explain } = await searchParams;
  const tables = demoTables(DEMO_TENANT.id);
  const areas = demoAreas(DEMO_TENANT.id).map((a) => ({ id: a.id, name: a.name }));
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const settings = resolveMenuSettings(DEMO_THEME.settings);

  return (
    <PosTerminal
      tenantId={DEMO_TENANT.id}
      userId="demo"
      restaurantName={DEMO_TENANT.name}
      brand={{ name: DEMO_TENANT.name, logoUrl: null, slogan: DEMO_TENANT.slogan, currency: DEMO_TENANT.currency, locale }}
      currency={DEMO_TENANT.currency}
      locale={locale}
      cashCountMode="total"
      cashDenominations={null}
      posTables={0}
      floorTables={tables.map((x) => ({ label: x.label, seats: x.seats, area: x.area_id ? (areaName.get(x.area_id) ?? null) : null }))}
      floorPlan={{ tables, areas }}
      // Empty on purpose: in demo mode the terminal fills in its sample menu.
      menu={{ categories: [], products: [] }}
      themeStyle={{ ...themeVars(DEMO_THEME, settings), ...posThemeVars(DEMO_THEME) }}
      customerPath="/demo/customer"
      demo
      explain={!!explain}
    />
  );
}
