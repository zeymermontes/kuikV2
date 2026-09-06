import { getLocale } from 'next-intl/server';
import { resolveMenuSettings } from '@/lib/menu-settings';
import { posThemeVars } from '@/lib/pos/theme';
import { themeVars } from '@/lib/theme-vars';
import { demoAreas, demoTables } from '@/lib/host/demo';
import { DEMO_TENANT } from '@/lib/demo-tenant';
import { getDemoRestaurant } from '@/lib/demo-menu';
import { PosTerminal } from '@/components/pos/PosTerminal';

export const dynamic = 'force-dynamic';

/** The register, on a showcase restaurant's real menu and a sample floor, with no account behind it. */
export default async function DemoPosPage({ searchParams }: { searchParams: Promise<{ explain?: string }> }) {
  const [locale, { explain }, r] = await Promise.all([getLocale(), searchParams, getDemoRestaurant()]);
  const tables = demoTables(DEMO_TENANT.id);
  const areas = demoAreas(DEMO_TENANT.id).map((a) => ({ id: a.id, name: a.name }));
  const areaName = new Map(areas.map((a) => [a.id, a.name]));
  const settings = resolveMenuSettings(r.theme.settings);

  return (
    <PosTerminal
      tenantId={DEMO_TENANT.id}
      userId="demo"
      restaurantName={r.name}
      brand={{ name: r.name, logoUrl: r.logoUrl, slogan: r.slogan, currency: r.currency, locale }}
      currency={r.currency}
      locale={locale}
      cashCountMode="total"
      cashDenominations={null}
      posTables={0}
      floorTables={tables.map((x) => ({ label: x.label, seats: x.seats, area: x.area_id ? (areaName.get(x.area_id) ?? null) : null }))}
      floorPlan={{ tables, areas }}
      // A real menu when a showcase restaurant exists; empty otherwise, and the demo fills in its sample.
      menu={r.menu}
      themeStyle={{ ...themeVars(r.theme, settings), ...posThemeVars(r.theme) }}
      customerPath="/demo/customer"
      demo
      explain={!!explain}
    />
  );
}
