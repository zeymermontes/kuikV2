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
  MemberRole,
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

  // Link any pending staff invites for this email (best-effort).
  await supabase.rpc('claim_pending_invites');

  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    profile,
  };
});

/**
 * The user's tenant membership (owner or staff), or null. Falls back to the
 * legacy owner_id lookup so existing owners keep working before the
 * tenant_members backfill (migration 0011) has run — without this, an owner
 * with no membership row would be bounced to /onboarding on every login.
 */
export const getMembership = cache(
  async (userId: string): Promise<{ tenant: Tenant; role: MemberRole } | null> => {
    const supabase = await createClient();

    const { data: member } = await supabase
      .from('tenant_members')
      .select('role, tenants(*)')
      .eq('user_id', userId)
      .order('created_at')
      .limit(1)
      .maybeSingle<{ role: MemberRole; tenants: Tenant }>();
    if (member?.tenants) return { tenant: member.tenants, role: member.role };

    // Fallback: treat the legacy tenant owner as the 'owner' role.
    const { data: owned } = await supabase
      .from('tenants')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at')
      .limit(1)
      .maybeSingle<Tenant>();
    if (owned) return { tenant: owned, role: 'owner' };

    return null;
  },
);

export interface TenantContext {
  user: AuthedUser;
  tenant: Tenant;
  role: MemberRole;
  theme: TenantTheme;
  contact: TenantContact;
  subscription: Subscription;
}

/**
 * Loads the full tenant context for dashboard pages. Redirects to /login if not
 * authed and /onboarding if the user has no tenant/membership yet.
 */
export const requireTenant = cache(async (): Promise<TenantContext> => {
  const user = await requireUser();
  const membership = await getMembership(user.id);
  if (!membership) redirect('/onboarding');
  const { tenant, role } = membership;

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
    role,
    theme: theme!,
    contact: contact!,
    subscription: subscription!,
  };
});

/** Guards owner-only pages (billing, domain, settings, staff). */
export const requireOwner = cache(async (): Promise<TenantContext> => {
  const ctx = await requireTenant();
  if (ctx.role !== 'owner') redirect('/menu');
  return ctx;
});

/** Guards manager+ pages (full menu editing). */
export const requireManager = cache(async (): Promise<TenantContext> => {
  const ctx = await requireTenant();
  if (ctx.role === 'waiter') redirect('/menu');
  return ctx;
});

/** Guards super-admin-only pages. */
export const requireSuperAdmin = cache(async (): Promise<AuthedUser> => {
  const user = await requireUser();
  if (user.profile.role !== 'super_admin') redirect('/dashboard');
  return user;
});
