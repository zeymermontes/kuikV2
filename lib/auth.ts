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
 * The signed-in user + profile, or null. Never redirects.
 * Wrapped in cache() so the layout and the page in the same render share ONE
 * claims lookup instead of each making their own.
 */
export const loadUser = cache(async (): Promise<AuthedUser | null> => {
  const supabase = await createClient();
  // getClaims() verifies the JWT signature locally (no /auth/v1/user round-trip
  // when the project uses asymmetric signing keys), so it's much faster than
  // getUser() while still being a real authorization check.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', claims.sub)
    .single<Profile>();

  if (!profile) return null;

  // Link any pending staff invites for this email (best-effort).
  await supabase.rpc('claim_pending_invites');

  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : null,
    profile,
  };
});

/** The signed-in user + profile, or a redirect to /login. */
export const requireUser = cache(async (): Promise<AuthedUser> => {
  const user = await loadUser();
  if (!user) redirect('/login');
  return user;
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

type TenantLoad =
  | { ok: true; ctx: TenantContext }
  | { ok: false; reason: 'unauthenticated' | 'no_tenant' };

/**
 * The whole of requireTenant's work, minus the redirects.
 *
 * Next's docs are explicit that `redirect()` throws NEXT_REDIRECT and must be
 * called outside try/catch, so a "try to load, else null" helper cannot simply
 * wrap the redirecting version — it would swallow genuine errors along with the
 * redirect. Splitting the loader out is the honest way to serve both callers.
 */
const loadTenantContext = cache(async (): Promise<TenantLoad> => {
  const user = await loadUser();
  if (!user) return { ok: false, reason: 'unauthenticated' };
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
    if (!membership) return { ok: false, reason: 'no_tenant' };
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
    ok: true,
    ctx: {
      user,
      tenant,
      role,
      theme: theme!,
      contact: contact!,
      subscription: subscription!,
      support,
    },
  };
});

/**
 * Loads the full tenant context for dashboard pages. Redirects to /login if not
 * authed and /onboarding if the user has no tenant/membership yet.
 */
export const requireTenant = cache(async (): Promise<TenantContext> => {
  const loaded = await loadTenantContext();
  if (loaded.ok) return loaded.ctx;
  redirect(loaded.reason === 'unauthenticated' ? '/login' : '/onboarding');
});

/**
 * Same context, but returns null instead of redirecting.
 *
 * Route Handlers need this: `redirect('/login')` there produces a 307 to an
 * HTML page, which is useless to a service worker or to a fetch() that expects
 * a 401. Pages should keep using requireTenant().
 */
export const tryTenant = cache(async (): Promise<TenantContext | null> => {
  const loaded = await loadTenantContext();
  return loaded.ok ? loaded.ctx : null;
});

/** Where each role's dashboard begins, used when a guard turns someone away. */
const ROLE_HOME: Record<MemberRole, string> = {
  owner: '/dashboard',
  manager: '/dashboard',
  cashier: '/menu',
  waiter: '/menu',
  host: '/reservations',
};

export function homeForRole(role: MemberRole): string {
  return ROLE_HOME[role] ?? '/menu';
}

/**
 * Build a guard from an ALLOW-list of roles.
 *
 * Deliberately not a deny-list. `requireManager` used to be
 * `if (ctx.role === 'waiter') redirect(...)`, which meant every role added
 * after it was written silently gained manager access — `cashier` (added in
 * 0033_pos.sql) could reach /reports and create or delete branches. An
 * allow-list fails closed instead, so adding a role never widens anything.
 *
 * Keep these lists in step with `NAV` in components/dashboard/Sidebar.tsx;
 * the two together decide what a role can reach.
 */
const requireRole = (...roles: MemberRole[]) =>
  cache(async (): Promise<TenantContext> => {
    const ctx = await requireTenant();
    // Support mode resolves role as 'owner' for a super-admin; leave it alone.
    if (!ctx.support && !roles.includes(ctx.role)) redirect(homeForRole(ctx.role));
    return ctx;
  });

/** Guards owner-only pages (billing, domain, settings, staff). */
export const requireOwner = cache(async (): Promise<TenantContext> => {
  const ctx = await requireTenant();
  if (!ctx.support && ctx.role !== 'owner') redirect(homeForRole(ctx.role));
  return ctx;
});

/** Guards manager+ pages: full menu editing, branches, imports. */
export const requireManager = requireRole('owner', 'manager');

/** Revenue, orders and analytics. Mirrors can_view_sales() in 0043. */
export const requireAnalytics = requireRole('owner', 'manager');

/** The reservation book. Mirrors can_manage_reservations() in 0043. */
export const requireReservations = requireRole(
  'owner',
  'manager',
  'cashier',
  'waiter',
  'host',
);

/** The order board. Service staff need it; the door does not. */
export const requireOrders = requireRole('owner', 'manager', 'cashier', 'waiter');

/** Loyalty holds diner PII. Mirrors can_use_loyalty() in 0043. */
export const requireLoyalty = requireRole('owner', 'manager', 'cashier', 'waiter');

/** Guards super-admin-only pages. */
export const requireSuperAdmin = cache(async (): Promise<AuthedUser> => {
  const user = await requireUser();
  if (user.profile.role !== 'super_admin') redirect('/dashboard');
  return user;
});
