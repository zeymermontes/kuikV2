// Editing an order's lines from the board. Pure, so the sheet can recompute
// as staff type and the tests can check the arithmetic. The lines are the
// cart's own shape (lib/whatsapp CartLine), as the order route stored them.

export interface EditableLine {
  key?: string;
  productId?: string;
  name?: string;
  basePrice?: number;
  qty?: number;
  selections?: { group?: string; name?: string; price?: number }[];
  note?: string;
}

/** One unit's price: the product plus its chosen options. */
export function unitPrice(l: EditableLine): number {
  return (l.basePrice ?? 0) + (l.selections ?? []).reduce((n, s) => n + (s.price ?? 0), 0);
}

export function lineTotal(l: EditableLine): number {
  return unitPrice(l) * (l.qty ?? 1);
}

export function linesSubtotal(lines: EditableLine[]): number {
  return lines.reduce((n, l) => n + lineTotal(l), 0);
}

/**
 * The order's new total after its lines changed: the lines' new subtotal
 * plus whatever the old total carried beyond the old lines (delivery, tip,
 * a discount), so those survive an edit. Never below zero.
 */
export function retotal(oldTotal: number | null, oldLines: EditableLine[], newLines: EditableLine[]): number {
  const extras = oldTotal == null ? 0 : oldTotal - linesSubtotal(oldLines);
  return Math.max(0, Math.round((linesSubtotal(newLines) + extras) * 100) / 100);
}
