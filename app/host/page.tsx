import { getLocale } from 'next-intl/server';
import { requireReservations } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayInTz } from '@/lib/time';
import { posThemeVars } from '@/lib/pos/theme';
import { DEFAULT_LATE_MINUTES, DEFAULT_SHIFTS, DEFAULT_TURNS } from '@/lib/host/model';
import type { FloorTable, FloorCombination, Reservation, ReservationArea, TenantContact } from '@/lib/database.types';
import { HostApp } from '@/components/host/HostApp';
import { getPendingSummary } from '@/app/(dashboard)/reservations/actions';
import { demoAreas, demoCombinations, demoReservations, demoTables } from '@/lib/host/demo';
import { branchFilter, resolveBranch } from '@/lib/branches';
import { DeviceBranchSync } from '@/components/pos/DeviceBranchSync';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `?demo=1` shows a sample floor and day in memory: the dashboard preview, and a first look before a plan exists. */
export default async function HostPage({ searchParams }: { searchParams: Promise<{ d?: string; demo?: string; explain?: string; branch?: string }> }) {
  const ctx = await requireReservations();
  const { tenant, theme, role, support } = ctx;
  const supabase = await createClient();
  const locale = await getLocale();
  const { d, demo: demoParam, explain: explainParam, branch: branchParam } = await searchParams;
  const demo = !!demoParam;
  const branch = demo ? null : await resolveBranch(supabase, tenant.id, branchParam);
  const branchId = branch?.id ?? null;
  const explain = demo && !!explainParam;

  // "Today" at the restaurant, not on the server (see app/(dashboard)/reservations).
  const today = todayInTz(tenant.timezone);
  const day = d && ISO_DATE.test(d) ? d : today;

  const [{ data: rows }, { data: tables }, { data: combos }, { data: areas }, { data: contact }, pending] = await Promise.all([
    branchFilter(supabase.from('reservations').select('*').eq('tenant_id', tenant.id).eq('date', day), branchId).order('time', { ascending: true }),
    branchFilter(supabase.from('floor_tables').select('*').eq('tenant_id', tenant.id), branchId).order('position', { ascending: true }),
    supabase.from('floor_combinations').select('*').eq('tenant_id', tenant.id),
    branchFilter(supabase.from('reservation_areas').select('*').eq('tenant_id', tenant.id), branchId).order('position', { ascending: true }),
    supabase.from('tenant_contact').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    getPendingSummary(),
  ]);
  const c = contact as TenantContact | null;

  return (
    <>
    <DeviceBranchSync branch={branch ? { id: branch.id, name: branch.name, slug: branch.slug } : null} />
    <HostApp
      tenantId={tenant.id}
      branchId={branchId}
      tenantName={tenant.name}
      logoUrl={theme.logo_url}
      day={day}
      today={today}
      timezone={tenant.timezone}
      locale={locale}
      initial={
        demo
          ? { reservations: demoReservations(tenant.id, day), tables: demoTables(tenant.id), combos: demoCombinations(tenant.id) }
          : { reservations: (rows ?? []) as Reservation[], tables: (tables ?? []) as FloorTable[], combos: (combos ?? []) as FloorCombination[] }
      }
      areas={demo ? demoAreas(tenant.id) : ((areas ?? []) as ReservationArea[])}
      settings={{
        shifts: c?.reservation_shifts?.length ? c.reservation_shifts : DEFAULT_SHIFTS,
        turns: c?.reservation_turn_minutes ?? DEFAULT_TURNS,
        late: c?.reservation_late_minutes ?? DEFAULT_LATE_MINUTES,
        slotMinutes: c?.reservation_slot_minutes ?? 30,
      }}
      pendingTotal={pending.total}
      canEdit={support || role === 'owner' || role === 'manager'}
      demo={demo}
      explain={explain}
      themeStyle={posThemeVars(theme)}
    />
    </>
  );
}
