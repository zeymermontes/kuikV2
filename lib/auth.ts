import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type {
  Profile,
  Tenant,
  TenantTheme,
  TenantContact,
  Subscription,
} from '@/lib/database.types';

export interface AuthedUser {
  id: string;
  email: string | null;
  profile: Profile;
}

/**
 * Returns the signed-in user + profile, or redirects to /login.
 * Wrapped in cache() so the layout and the page in the same render share ONE
 * getUser() network call instead of each making their own.
 */
export const requireUser = cache(async (): Promise<AuthedUser> => {
  const supabase = await createClient();
  // getClaims() verifies the JWT signature locally (no /auth/v1/user round-trip
  // when the project uses asymmetric signing keys), so it's much faster than
  // getUser() while still being a real authorization check.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', claims.sub)
    .single<Profile>();

  if (!profile) redirect('/login');
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    profile,
  };
});

/** The owner's tenant, or null if they haven't onboarded yet. */
export const getOwnerTenant = cache(async (userId: string): Promise<Tenant | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tenants')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at')
    .limit(1)
    .maybeSingle<Tenant>();
  return data ?? null;
});

export interface TenantContext {
  user: AuthedUser;
  tenant: Tenant;
  theme: TenantTheme;
  contact: TenantContact;
  subscription: Subscription;
}

/**
 * Loads the full tenant context for dashboard pages. Redirects to /login if not
 * authed and /onboarding if the user has no tenant yet.
 */
export const requireTenant = cache(async (): Promise<TenantContext> => {
  const user = await requireUser();
  const tenant = await getOwnerTenant(user.id);
  if (!tenant) redirect('/onboarding');

  const supabase = await createClient();
  const [{ data: theme }, { data: contact }, { data: subscription }] =
    await Promise.all([
      supabase.from('tenant_theme').select('*').eq('tenant_id', tenant.id).single<TenantTheme>(),
      supabase.from('tenant_contact').select('*').eq('tenant_id', tenant.id).single<TenantContact>(),
      supabase.from('subscriptions').select('*').eq('tenant_id', tenant.id).single<Subscription>(),
    ]);

  return {
    user,
    tenant,
    theme: theme!,
    contact: contact!,
    subscription: subscription!,
  };
});

/** Guards super-admin-only pages. */
export const requireSuperAdmin = cache(async (): Promise<AuthedUser> => {
  const user = await requireUser();
  if (user.profile.role !== 'super_admin') redirect('/dashboard');
  return user;
});
