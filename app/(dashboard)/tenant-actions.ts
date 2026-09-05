'use server';

import { cookies } from 'next/headers';
import { requireUser, getMemberships } from '@/lib/auth';

/**
 * Switch the active restaurant (stored in a cookie). The caller then reloads
 * the dashboard itself: everything on screen (sidebar, plan, badges) belongs to
 * the other tenant, and a hard navigation is both simpler and immune to the
 * service worker mishandling a server-action redirect.
 */
export async function setActiveTenant(tenantId: string): Promise<boolean> {
  const user = await requireUser();
  const memberships = await getMemberships(user.id);
  if (!memberships.some((m) => m.tenant.id === tenantId)) return false;

  const cookieStore = await cookies();
  cookieStore.set('kuik_tenant', tenantId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
  return true;
}
