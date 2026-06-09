import type { Subscription } from '@/lib/database.types';

export type PlanTier = 'basic' | 'pro';

// Features locked to the Pro plan. Everything else is available on Basic.
export type Feature = 'custom_domain' | 'loyalty' | 'branches' | 'pro_reports' | 'pos';
const PRO_ONLY: Feature[] = ['custom_domain', 'loyalty', 'branches', 'pro_reports', 'pos'];

export function canUse(plan: PlanTier, feature: Feature): boolean {
  if (plan === 'pro') return true;
  return !PRO_ONLY.includes(feature);
}

/**
 * The plan a tenant effectively has right now. Trialing tenants get full Pro
 * access during their free month; afterwards they have whatever tier they pay
 * for (default 'basic').
 */
export function effectivePlan(sub: Pick<Subscription, 'status' | 'plan'>): PlanTier {
  if (sub.status === 'trialing') return 'pro';
  return sub.plan;
}

export function isPro(sub: Pick<Subscription, 'status' | 'plan'>): boolean {
  return effectivePlan(sub) === 'pro';
}
