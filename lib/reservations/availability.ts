import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseWeekHours } from '@/lib/hours';
import { todayInTz } from '@/lib/time';
import { dayAvailability, type DayStatus } from './day';

/**
 * Can this restaurant (or branch) take a booking on `date`? Reads the same
 * settings and rows the booking RPC does, so the early answer and the final
 * one agree. Any read failure answers "yes": the RPC still has the last word.
 */
export async function reservationDayStatus(
  supabase: SupabaseClient,
  params: { tenantId: string; branchId: string | null; date: string; partySize?: number },
): Promise<DayStatus> {
  try {
    const [{ data: tenant }, { data: contact }, { data: branch }, { data: areas }, { data: taken }] = await Promise.all([
      supabase.from('tenants').select('timezone').eq('id', params.tenantId).maybeSingle(),
      supabase
        .from('tenant_contact')
        .select('reservations_enabled, reservation_slot_minutes, reservation_max_days, hours')
        .eq('tenant_id', params.tenantId)
        .maybeSingle(),
      params.branchId
        ? supabase.from('branches').select('hours').eq('id', params.branchId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('reservation_areas')
        .select('id, max_covers, branch_id')
        .eq('tenant_id', params.tenantId)
        .eq('public_bookable', true),
      supabase
        .from('reservations')
        .select('area_id, time, party_size')
        .eq('tenant_id', params.tenantId)
        .eq('date', params.date)
        .in('status', ['pending', 'confirmed', 'arrived', 'partial', 'seated']),
    ]);
    const c = contact as { reservations_enabled: boolean; reservation_slot_minutes: number; reservation_max_days: number; hours: unknown } | null;
    if (!c) return { ok: true };
    const tz = (tenant as { timezone: string | null } | null)?.timezone;
    const branchHours = (branch as { hours: unknown } | null)?.hours;
    const areaRows = ((areas ?? []) as { id: string; max_covers: number | null; branch_id: string | null }[])
      // A branch's number books that branch's areas (plus the shared ones).
      .filter((a) => !a.branch_id || !params.branchId || a.branch_id === params.branchId);
    return dayAvailability({
      date: params.date,
      today: todayInTz(tz),
      enabled: Boolean(c.reservations_enabled),
      maxDays: c.reservation_max_days ?? 60,
      slotMinutes: c.reservation_slot_minutes ?? 30,
      hours: parseWeekHours(branchHours ?? c.hours),
      areas: areaRows.map((a) => ({ id: a.id, maxCovers: a.max_covers })),
      reservations: ((taken ?? []) as { area_id: string | null; time: string; party_size: number }[]).map((r) => ({
        areaId: r.area_id,
        time: String(r.time).slice(0, 5),
        partySize: r.party_size,
      })),
      partySize: params.partySize,
    });
  } catch {
    return { ok: true };
  }
}
