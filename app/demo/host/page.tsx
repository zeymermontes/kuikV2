import { getLocale } from 'next-intl/server';
import { todayInTz } from '@/lib/time';
import { posThemeVars } from '@/lib/pos/theme';
import { DEFAULT_LATE_MINUTES, DEFAULT_SHIFTS, DEFAULT_TURNS } from '@/lib/host/model';
import { demoAreas, demoCombinations, demoReservations, demoTables } from '@/lib/host/demo';
import { DEMO_TENANT, DEMO_THEME } from '@/lib/demo-tenant';
import { HostApp } from '@/components/host/HostApp';

export const dynamic = 'force-dynamic';

/** The host stand on a sample floor and a sample evening. */
export default async function DemoHostPage({ searchParams }: { searchParams: Promise<{ explain?: string }> }) {
  const locale = await getLocale();
  const { explain } = await searchParams;
  const today = todayInTz(DEMO_TENANT.timezone);
  return (
    <HostApp
      tenantId={DEMO_TENANT.id}
      tenantName={DEMO_TENANT.name}
      logoUrl={null}
      day={today}
      today={today}
      timezone={DEMO_TENANT.timezone}
      locale={locale}
      initial={{
        reservations: demoReservations(DEMO_TENANT.id, today),
        tables: demoTables(DEMO_TENANT.id),
        combos: demoCombinations(DEMO_TENANT.id),
      }}
      areas={demoAreas(DEMO_TENANT.id)}
      settings={{ shifts: DEFAULT_SHIFTS, turns: DEFAULT_TURNS, late: DEFAULT_LATE_MINUTES, slotMinutes: 30 }}
      pendingTotal={0}
      canEdit
      demo
      explain={!!explain}
      themeStyle={posThemeVars(DEMO_THEME)}
    />
  );
}
