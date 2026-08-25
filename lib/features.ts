import type { Profile } from '@/lib/database.types';

// Dev-only feature gating.
//
// Some features (POS, KDS, Orders) are still in development. Their code ships
// with the app but is hidden from every account except the super admin, so the
// rest of Kuik can go out without exposing half-finished features.
//
// The gate is the `super_admin` role on the user's profile — not an email
// allowlist — so granting or revoking access is a database change, not a
// deploy. To launch a feature, remove its gate: the nav `dev` flag in
// Sidebar.tsx, the route guards in app/pos, app/kds and app/(dashboard)/orders,
// and the `showPosSettings` props on the ordering/menu forms.

/** True if this account may see in-development features (POS, KDS, Orders). */
export function canUseDevFeatures(profile: Profile | null | undefined): boolean {
  return profile?.role === 'super_admin';
}

/**
 * The same check for a dashboard request. Support mode is excluded: while the
 * super admin is acting as a tenant they should see exactly what that tenant
 * sees, which does not include features still in development.
 */
export function showDevFeatures(ctx: {
  user: { profile: Profile };
  support: boolean;
}): boolean {
  return canUseDevFeatures(ctx.user.profile) && !ctx.support;
}
