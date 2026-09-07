import type { Subscription } from '@/lib/database.types';

// Two tiers and one add-on.
//
//   basic  "Menú":        menu, WhatsApp orders, online payment, reservations
//   pro    "Restaurante": + host stand, WhatsApp bot, loyalty, branches, custom
//                         domain, advanced reports
//   addon  "pos":         register, kitchen screen, printing, customer screen —
//                         joins either tier
//
// The trial month has everything, so a restaurant decides with the full
// product in hand.

export type PlanTier = 'basic' | 'pro';
export type Addon = 'pos';
export const ADDONS: readonly Addon[] = ['pos'];

export type Feature = 'custom_domain' | 'loyalty' | 'branches' | 'pro_reports' | 'pos' | 'wa_bots';
// Branches are on either tier, paid per branch (lib/pricing.ts, 0082).
const PRO_ONLY: Feature[] = ['custom_domain', 'loyalty', 'pro_reports', 'wa_bots'];
const ADDON_OF: Partial<Record<Feature, Addon>> = { pos: 'pos' };

type SubLike = Pick<Subscription, 'status' | 'plan'> & { addons?: readonly string[] | null };

export function isAddon(x: string): x is Addon {
  return (ADDONS as readonly string[]).includes(x);
}

/** Whether a tier plus its add-ons may use a feature. */
export function canUse(plan: PlanTier, feature: Feature, addons: readonly Addon[] = []): boolean {
  const addon = ADDON_OF[feature];
  if (addon) return addons.includes(addon);
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

/** The add-ons in force: all of them during the trial, else the paid ones. */
export function effectiveAddons(sub: SubLike): Addon[] {
  if (sub.status === 'trialing') return [...ADDONS];
  return (sub.addons ?? []).filter(isAddon);
}

export function isPro(sub: Pick<Subscription, 'status' | 'plan'>): boolean {
  return effectivePlan(sub) === 'pro';
}

/** Register, kitchen screen, printing, customer screen. */
export function canUsePos(sub: SubLike): boolean {
  return effectiveAddons(sub).includes('pos');
}

/** Kuik's cut of an online payment for this tier; the higher tier may pay less. */
export function feePercentFor(
  settings: { payment_fee_percent: number; pro_payment_fee_percent: number | null },
  plan: PlanTier,
): number {
  if (plan === 'pro' && settings.pro_payment_fee_percent != null) return settings.pro_payment_fee_percent;
  return settings.payment_fee_percent;
}
