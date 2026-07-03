// Dev-only feature gating.
//
// Some features (POS, KDS, Orders) are still in development. We keep their code
// in the app but hide them from everyone EXCEPT the accounts below, so the rest
// of the app can ship without exposing half-finished features. To launch a
// feature, remove its gate (the nav `dev` flag + the route guards) — or just
// add more emails here while it's still being tested.

const DEV_FEATURE_EMAILS = new Set<string>([
  'zeymermontes@gmail.com',
]);

/** True if this account may see in-development features. */
export function canUseDevFeatures(email: string | null | undefined): boolean {
  return !!email && DEV_FEATURE_EMAILS.has(email.trim().toLowerCase());
}
