// Promotions: the one rule file for what a discount is worth, shared by the
// register (offline), the diner's cart and the server that prices an online
// order. Pure: dates and the timezone come in as arguments.

import type { Promotion, PromotionChannel } from '@/lib/database.types';
import { nowHHMMInTz, todayInTz, weekdayInTz } from '@/lib/time';

/** A line as the rule sees it: what, how many, at what unit price. */
export interface PromoLine {
  productId: string | null;
  categoryId: string | null;
  unitPrice: number;
  qty: number;
}

export interface AppliedPromo {
  id: string;
  name: string;
  amount: number;
}

export interface PromoResult {
  applied: AppliedPromo[];
  /** Sum of `applied`, never more than the subtotal. */
  discount: number;
  /** The typed code matched nothing live. */
  badCode: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Whether a promotion is switched on and inside its day, hour and date window right now. */
export function isPromotionLive(p: Promotion, o: { now?: Date; tz?: string | null } = {}): boolean {
  if (!p.active) return false;
  const now = o.now ?? new Date();
  const today = todayInTz(o.tz, now);
  if (p.starts_on && today < p.starts_on) return false;
  if (p.ends_on && today > p.ends_on) return false;
  if (p.days.length > 0 && !p.days.includes(weekdayInTz(o.tz, now))) return false;
  if (p.start_time || p.end_time) {
    const hhmm = nowHHMMInTz(o.tz, now);
    const start = (p.start_time ?? '00:00').slice(0, 5);
    const end = (p.end_time ?? '23:59').slice(0, 5);
    // A window past midnight (22:00 → 02:00) wraps.
    const inside = start <= end ? hhmm >= start && hhmm <= end : hhmm >= start || hhmm <= end;
    if (!inside) return false;
  }
  return true;
}

function matches(p: Promotion, l: PromoLine): boolean {
  if (p.scope === 'order') return true;
  if (p.scope === 'category') return !!l.categoryId && p.category_ids.includes(l.categoryId);
  return !!l.productId && p.product_ids.includes(l.productId);
}

/** What one promotion takes off these lines, ignoring time windows and codes. */
export function promotionAmount(p: Promotion, lines: PromoLine[], subtotal: number): number {
  if (p.min_subtotal != null && subtotal < p.min_subtotal) return 0;
  const hit = lines.filter((l) => matches(p, l));
  if (hit.length === 0) return 0;
  const base = round2(hit.reduce((s, l) => s + l.unitPrice * l.qty, 0));
  if (base <= 0) return 0;
  switch (p.kind) {
    case 'percent':
      return round2((base * Math.max(0, Math.min(100, Number(p.value) || 0))) / 100);
    case 'amount':
      return round2(Math.min(base, Math.max(0, Number(p.value) || 0)));
    case 'bogo': {
      // Every second unit of a matching line is free; the free one is the cheaper when lines differ.
      const units = hit.flatMap((l) => Array.from({ length: Math.max(0, Math.round(l.qty)) }, () => l.unitPrice)).sort((a, b) => a - b);
      const free = Math.floor(units.length / 2);
      return round2(units.slice(0, free).reduce((s, u) => s + u, 0));
    }
  }
}

/**
 * The discount for a basket. Automatic promotions apply by themselves; a
 * coupon applies when its code was typed. Non-stackable promotions compete
 * and the best single one wins; stackable ones add on top.
 */
export function applyPromotions(
  promos: Promotion[],
  lines: PromoLine[],
  o: { channel: PromotionChannel; code?: string | null; now?: Date; tz?: string | null },
): PromoResult {
  const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.qty, 0));
  const code = o.code?.trim().toUpperCase() || null;
  const live = promos.filter((p) => p.channels.includes(o.channel) && isPromotionLive(p, o));
  const candidates = live.filter((p) => (p.code ? code === p.code.toUpperCase() : true));
  const badCode = !!code && !live.some((p) => p.code && p.code.toUpperCase() === code);

  const valued = candidates.map((p) => ({ p, amount: promotionAmount(p, lines, subtotal) })).filter((x) => x.amount > 0);
  const exclusive = valued.filter((x) => !x.p.stackable).sort((a, b) => b.amount - a.amount);
  const chosen = [...(exclusive.length ? [exclusive[0]] : []), ...valued.filter((x) => x.p.stackable)];

  let remaining = subtotal;
  const applied: AppliedPromo[] = [];
  for (const x of chosen) {
    const amount = round2(Math.min(x.amount, remaining));
    if (amount <= 0) continue;
    applied.push({ id: x.p.id, name: x.p.name, amount });
    remaining = round2(remaining - amount);
  }
  return { applied, discount: round2(applied.reduce((s, a) => s + a.amount, 0)), badCode };
}

/** Whether any live promotion on this channel is a coupon, so the cart shows a code box. */
export function hasCoupons(promos: Promotion[], channel: PromotionChannel, o: { now?: Date; tz?: string | null } = {}): boolean {
  return promos.some((p) => !!p.code && p.channels.includes(channel) && isPromotionLive(p, o));
}
