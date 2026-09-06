// The amount a guest is charged is settled on the server, from the products
// table, never from the numbers the cart sent: a tampered cart can rename a
// line or drop its price, but the charge follows what the menu says.
//
// Kept free of server-only imports so it runs in node tests.

import type { CartLine } from '@/lib/whatsapp';

export interface PricedLine {
  name: string;
  qty: number;
  unitAmount: number;
}

export interface OrderAmount {
  lines: PricedLine[];
  subtotal: number;
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
  priceOf: (productId: string) => number | null,
  o: { tipPercent?: number | null; deliveryFee?: number | null; freeDeliveryOver?: number | null; delivery: boolean },
): OrderAmount | null {
  const priced: PricedLine[] = [];
  for (const l of lines) {
    const base = priceOf(l.productId);
    if (base == null) return null;
    const qty = Math.max(1, Math.min(99, Math.round(l.qty || 1)));
    // Option surcharges are the one thing taken from the cart, floored at zero
    // so a negative "extra" cannot discount the base.
    const extras = (l.selections ?? []).reduce((s, sel) => s + Math.max(0, Number(sel.price) || 0), 0);
    priced.push({ name: l.name, qty, unitAmount: round2(base + extras) });
  }
  if (priced.length === 0) return null;
  const subtotal = round2(priced.reduce((s, l) => s + l.unitAmount * l.qty, 0));
  if (subtotal <= 0) return null;
  const deliveryFee = o.delivery
    ? o.freeDeliveryOver != null && subtotal >= o.freeDeliveryOver
      ? 0
      : round2(o.deliveryFee ?? 0)
    : 0;
  const tipPct = Math.max(0, Math.min(50, Number(o.tipPercent) || 0));
  const tip = round2((subtotal * tipPct) / 100);
  return { lines: priced, subtotal, deliveryFee, tip, total: round2(subtotal + deliveryFee + tip) };
}

/** Kuik's cut of one payment. */
export function applicationFee(total: number, percent: number): number {
  const p = Math.max(0, Math.min(30, Number(percent) || 0));
  return round2((total * p) / 100);
}
