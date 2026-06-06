'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireUser, getMemberships } from '@/lib/auth';

/** Switch the active restaurant (stored in a cookie) and reload the dashboard. */
export async function setActiveTenant(tenantId: string) {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  if (!memberships.some((m) => m.tenant.id === tenantId)) return;

  const cookieStore = await cookies();
  cookieStore.set('kuik_tenant', tenantId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  redirect('/dashboard');
}
