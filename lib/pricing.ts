// What a restaurant pays per month, in one place: the tier, the point-of-sale
// add-on, and one line per branch. Pure, so the billing page, the MercadoPago
// preapproval and the branches page all quote the same number.

import type { Addon, PlanTier } from '@/lib/plan';

export interface PriceTable {
  plan_amount: number;
  pro_amount: number;
  extra_amount: number;
  pos_addon_amount: number;
  branch_amount_basic: number;
  branch_amount_pro: number;
}

/** What one branch adds per month on this tier. */
export function branchAmount(prices: PriceTable, plan: PlanTier): number {
  return plan === 'pro' ? prices.branch_amount_pro : prices.branch_amount_basic;
}

/**
 * The monthly charge: tier (or the additional-restaurant line), plus the POS
 * add-on when taken, plus every branch at the tier's branch price.
 */
export function monthlyAmount(
  prices: PriceTable,
  o: { plan: PlanTier; addons?: readonly Addon[]; branches?: number; additional?: boolean },
): number {
  const base = o.additional ? prices.extra_amount : o.plan === 'pro' ? prices.pro_amount : prices.plan_amount;
  const pos = o.addons?.includes('pos') ? prices.pos_addon_amount : 0;
  const branches = Math.max(0, o.branches ?? 0) * branchAmount(prices, o.plan);
  return Math.round((base + pos + branches) * 100) / 100;
}
