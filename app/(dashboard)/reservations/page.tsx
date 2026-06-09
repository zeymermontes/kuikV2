import { getTranslations } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { daysAgoISO } from '@/lib/utils';
import type { Reservation, TenantContact } from '@/lib/database.types';
import { ReservationsList } from '@/components/dashboard/ReservationsList';

export const dynamic = 'force-dynamic';

export default async function ReservationsPage() {
  const { tenant } = await requireTenant();
  const t = await getTranslations('reservations');
  const supabase = await createClient();

  // Today onward (derived from a date string keeps the page render pure).
  const today = daysAgoISO(0).slice(0, 10);

  const [{ data: contact }, { data: rows }] = await Promise.all([
    supabase.from('tenant_contact').select('reservations_enabled, reservation_required').eq('tenant_id', tenant.id).maybeSingle(),
    supabase
      .from('reservations')
      .select('*')
      .eq('tenant_id', tenant.id)
      .gte('date', today)
      .order('date', { ascending: true })
      .order('time', { ascending: true }),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <ReservationsList
        reservations={(rows ?? []) as Reservation[]}
        enabled={(contact as Pick<TenantContact, 'reservations_enabled'> | null)?.reservations_enabled ?? false}
        required={(contact as Pick<TenantContact, 'reservation_required'> | null)?.reservation_required ?? null}
      />
    </div>
  );
}
