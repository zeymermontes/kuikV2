'use server';

import { revalidatePath } from 'next/cache';
import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { ReservationStatus } from '@/lib/database.types';

export async function setReservationStatus(id: string, status: ReservationStatus): Promise<void> {
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  await supabase.from('reservations').update({ status }).eq('id', id).eq('tenant_id', tenant.id);
  revalidatePath('/reservations');
}

export async function toggleReservations(enabled: boolean): Promise<void> {
  const { tenant } = await requireTenant();
  const supabase = await createClient();
  await supabase.from('tenant_contact').update({ reservations_enabled: enabled }).eq('tenant_id', tenant.id);
  revalidatePath('/reservations');
  revalidatePath(`/s/${tenant.subdomain}`);
}
