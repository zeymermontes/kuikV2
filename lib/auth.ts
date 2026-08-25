import 'server-only';
import { cache } from 'react';
import { cookies } from 'next/headers';
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

export interface Membership {
  tenant: Tenant;
  role: MemberRole;
}

/** All restaurants the user belongs to (owner or staff). */
export const getMemberships = cache(async (userId: string): Promise<Membership[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from('tenant_members')
    .select('role, tenants(*)')
    .eq('user_id', userId)
    .order('created_at');
  const rows = (data ?? []) as unknown as {
    role: MemberRole;
    tenants: Tenant | Tenant[] | null;
  }[];
  const memberships = rows
    .map((r) => ({ role: r.role, tenant: Array.isArray(r.tenants) ? r.tenants[0] : r.tenants }))
    .filter((m): m is Membership => Boolean(m.tenant));
  if (memberships.length > 0) return memberships;

  // Legacy fallback (pre-0011 backfill): owner_id lookup.
  const { data: owned } = await supabase
    .from('tenants')
    .select('*')
    .eq('owner_id', userId)
    .order('created_at');
  return ((owned ?? []) as Tenant[]).map((tenant) => ({ tenant, role: 'owner' as MemberRole }));
});

/**
 * The user's active restaurant. Picks the one stored in the `kuik_tenant` cookie
 * (set by the restaurant switcher), else the first. Null if the user has none.
 */
export const getMembership = cache(
  async (userId: string): Promise<Membership | null> => {
    const all = await getMemberships(userId);
    if (all.length === 0) return null;
    const cookieStore = await cookies();
    const active = cookieStore.get('kuik_tenant')?.value;
    return all.find((m) => m.tenant.id === active) ?? all[0];
  },
);

export interface TenantContext {
  user: AuthedUser;
  tenant: Tenant;
  role: MemberRole;
  theme: TenantTheme;
  contact: TenantContact;
  subscription: Subscription;
  /** True when a super-admin is editing this tenant via support mode. */
  support: boolean;
}

/**
 * Loads the full tenant context for dashboard pages. Redirects to /login if not
 * authed and /onboarding if the user has no tenant/membership yet.
 */
export const requireTenant = cache(async (): Promise<TenantContext> => {
  const user = await requireUser();
  const supabase = await createClient();

  // Support mode: a super-admin opens any restaurant to help its owner. RLS
  // already grants super-admins full read/write on every tenant, so we just
  // resolve the tenant the support cookie points at (role acts as owner).
  const cookieStore = await cookies();
  const supportId =
    user.profile.role === 'super_admin' ? cookieStore.get('kuik_support')?.value : undefined;

  let tenant: Tenant | null = null;
  let role: MemberRole = 'owner';
  let support = false;

  if (supportId) {
    const { data } = await supabase.from('tenants').select('*').eq('id', supportId).single<Tenant>();
    if (data) {
      tenant = data;
      support = true;
    }
  }

  if (!tenant) {
    const membership = await getMembership(user.id);
    if (!membership) redirect('/onboarding');
    tenant = membership.tenant;
    role = membership.role;
  }

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
    support,
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
