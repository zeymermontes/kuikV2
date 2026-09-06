// The amount a guest is charged is settled on the server, from the products
// table, never from the numbers the cart sent: a tampered cart can rename a
// line or drop its price, but the charge follows what the menu says.
//
// Kept free of server-only imports so it runs in node tests.

import type { CartLine } from '@/lib/whatsapp';
import type { Promotion } from '@/lib/database.types';
import { applyPromotions, type AppliedPromo } from '@/lib/promotions';

export interface PricedLine {
  name: string;
  qty: number;
  unitAmount: number;
}

export interface OrderAmount {
  lines: PricedLine[];
  subtotal: number;
  /** Promotions taken off the subtotal. */
  discount: number;
  promos: AppliedPromo[];
  /** The typed coupon matched nothing. */
  badCode: boolean;
  deliveryFee: number;
  tip: number;
  total: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Re-price the cart. `priceOf` answers with the product's current price, or
 * null for an unknown / unpriced product, which makes the order unpayable
 * online (the guest can still send it over WhatsApp).
 */
export function priceOrder(
  lines: CartLine[],
  priceOf: (productId: string) => { price: number | null; categoryId?: string | null } | number | null,
  o: {
    tipPercent?: number | null;
    deliveryFee?: number | null;
    freeDeliveryOver?: number | null;
    delivery: boolean;
    promotions?: Promotion[];
    promoCode?: string | null;
    tz?: string | null;
    now?: Date;
  },
): OrderAmount | null {
  const priced: PricedLine[] = [];
  const promoLines: { productId: string; categoryId: string | null; unitPrice: number; qty: number }[] = [];
  for (const l of lines) {
    const found = priceOf(l.productId);
    const base = typeof found === 'number' || found == null ? found : found.price;
    if (base == null) return null;
    const qty = Math.max(1, Math.min(99, Math.round(l.qty || 1)));
    // Option surcharges are the one thing taken from the cart, floored at zero
    // so a negative "extra" cannot discount the base.
    const extras = (l.selections ?? []).reduce((s, sel) => s + Math.max(0, Number(sel.price) || 0), 0);
    const unitAmount = round2(base + extras);
    priced.push({ name: l.name, qty, unitAmount });
    promoLines.push({ productId: l.productId, categoryId: typeof found === 'object' ? (found?.categoryId ?? null) : null, unitPrice: unitAmount, qty });
  }
  if (priced.length === 0) return null;
  const subtotal = round2(priced.reduce((s, l) => s + l.unitAmount * l.qty, 0));
  if (subtotal <= 0) return null;
  const promo = o.promotions?.length || o.promoCode
    ? applyPromotions(o.promotions ?? [], promoLines, { channel: 'menu', code: o.promoCode, tz: o.tz, now: o.now })
    : { applied: [], discount: 0, badCode: false };
  const discount = Math.min(promo.discount, subtotal);
  const net = round2(subtotal - discount);
  const deliveryFee = o.delivery
    ? o.freeDeliveryOver != null && subtotal >= o.freeDeliveryOver
      ? 0
      : round2(o.deliveryFee ?? 0)
    : 0;
  const tipPct = Math.max(0, Math.min(50, Number(o.tipPercent) || 0));
  const tip = round2((net * tipPct) / 100);
  return { lines: priced, subtotal, discount, promos: promo.applied, badCode: promo.badCode, deliveryFee, tip, total: round2(net + deliveryFee + tip) };
}

/** Kuik's cut of one payment. */
export function applicationFee(total: number, percent: number): number {
  const p = Math.max(0, Math.min(30, Number(percent) || 0));
  return round2((total * p) / 100);
}

/**
 * The lines as a gateway wants them, with the discount taken off in
 * proportion: checkout pages accept no negative line, and the sum must still
 * equal what the guest sees. Rounding leftovers land on the last line.
 */
export function discountedLines(lines: PricedLine[], discount: number): PricedLine[] {
  if (!(discount > 0)) return lines;
  const gross = lines.reduce((s, l) => s + l.unitAmount * l.qty, 0);
  if (gross <= 0) return lines;
  const target = round2(gross - Math.min(discount, gross));
  const out = lines.map((l) => ({ ...l, unitAmount: round2((l.unitAmount * target) / gross) }));
  const sum = round2(out.reduce((s, l) => s + l.unitAmount * l.qty, 0));
  const last = out[out.length - 1];
  if (last && sum !== target) last.unitAmount = round2(last.unitAmount + (target - sum) / last.qty);
  return out.filter((l) => l.unitAmount > 0);
}
