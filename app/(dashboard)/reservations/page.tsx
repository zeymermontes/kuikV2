import { getTranslations } from 'next-intl/server';
import { requireReservations } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { todayInTz } from '@/lib/time';
import type { Reservation, ReservationArea, TenantContact } from '@/lib/database.types';
import { ReservationsBoard } from '@/components/dashboard/ReservationsBoard';
import { ReservationsSettings } from '@/components/dashboard/ReservationsSettings';
import { HostPreview } from '@/components/dashboard/HostPreview';
import { getPendingSummary } from './actions';

export const dynamic = 'force-dynamic';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<{ d?: string }>;
}) {
  const { tenant, role, support } = await requireReservations();
  const t = await getTranslations('reservations');
  const supabase = await createClient();
  const { d } = await searchParams;

  // "Today" means today AT THE RESTAURANT. Deriving it from the server clock
  // (UTC on Render) hid tonight's bookings from 18:00 Mexico time onward,
  // because UTC had already rolled over — exactly during service.
  const today = todayInTz(tenant.timezone);
  const day = d && ISO_DATE.test(d) ? d : today;

  const [{ data: contact }, { data: rows }, { data: areas }, pending] = await Promise.all([
    supabase.from('tenant_contact').select('*').eq('tenant_id', tenant.id).maybeSingle(),
    supabase
      .from('reservations')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('date', day)
      .order('time', { ascending: true }),
    supabase
      .from('reservation_areas')
      .select('*')
      .eq('tenant_id', tenant.id)
      .order('position', { ascending: true }),
    getPendingSummary(),
  ]);

  const c = contact as TenantContact | null;
  const canConfigure = support || role === 'owner' || role === 'manager';

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>

      {/* Keyed by day so switching days remounts with fresh state, rather
          than syncing props into state inside an effect. */}
      <ReservationsBoard
        key={day}
        tenantId={tenant.id}
        day={day}
        today={today}
        initial={(rows ?? []) as Reservation[]}
        areas={(areas ?? []) as ReservationArea[]}
        slotMinutes={c?.reservation_slot_minutes ?? 30}
        pendingSummary={pending}
      />

      {/* Only rendered for roles whose writes will actually persist. */}
      {canConfigure && (
        <ReservationsSettings
          enabled={c?.reservations_enabled ?? false}
          required={c?.reservation_required ?? null}
          policy={{
            reservation_slot_minutes: c?.reservation_slot_minutes ?? 30,
            reservation_max_party: c?.reservation_max_party ?? 20,
            reservation_lead_minutes: c?.reservation_lead_minutes ?? 60,
            reservation_max_days: c?.reservation_max_days ?? 60,
            reservation_auto_confirm: c?.reservation_auto_confirm ?? false,
          }}
          areas={(areas ?? []) as ReservationArea[]}
        />
      )}
      {canConfigure && <HostPreview />}
    </div>
  );
}
