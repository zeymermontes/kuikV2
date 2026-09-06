// From a sale to the concepts of a CFDI: pure arithmetic, tested in
// tests/cfdi.test.ts. Menu prices include IVA (that is how Mexican menus are
// written), so each unit price is split into a base and its tax, and the
// invoice adds up to exactly what the guest paid.

export interface SaleLine {
  name: string;
  qty: number;
  /** Unit price as charged, IVA included. */
  unitPrice: number;
  productCode?: string | null;
  unitCode?: string | null;
}

export interface Concept {
  description: string;
  quantity: number;
  productCode: string;
  unitCode: string;
  /** Per unit, before tax. */
  unitPrice: number;
  /** quantity × unitPrice, before tax. */
  subtotal: number;
  /** IVA rate as a fraction (0.16); null = exempt (TaxObject 01). */
  taxRate: number | null;
  tax: number;
  total: number;
}

export interface InvoiceTotals {
  concepts: Concept[];
  subtotal: number;
  tax: number;
  total: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

/**
 * Concepts with the tax carved out of the inclusive price. A discount is
 * spread over the lines in proportion before the split, so the CFDI total is
 * what was actually paid (the SAT wants the discounted amounts, not a
 * separate negative line).
 */
export function buildConcepts(
  lines: SaleLine[],
  o: { ivaPercent: number; discount?: number; productCode: string; unitCode: string },
): InvoiceTotals {
  const rate = Math.max(0, Number(o.ivaPercent) || 0) / 100;
  const gross = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const discount = Math.min(Math.max(0, o.discount ?? 0), gross);
  const factor = gross > 0 ? (gross - discount) / gross : 1;

  const concepts: Concept[] = [];
  for (const l of lines) {
    if (!(l.qty > 0) || !(l.unitPrice > 0)) continue;
    const inclusive = r6(l.unitPrice * factor);
    const unitPrice = r6(inclusive / (1 + rate));
    const subtotal = r2(unitPrice * l.qty);
    const total = r2(inclusive * l.qty);
    const tax = r2(total - subtotal);
    concepts.push({
      description: l.name.slice(0, 1000),
      quantity: l.qty,
      productCode: l.productCode || o.productCode,
      unitCode: l.unitCode || o.unitCode,
      unitPrice,
      subtotal,
      taxRate: rate > 0 ? rate : null,
      tax,
      total,
    });
  }
  const subtotal = r2(concepts.reduce((s, c) => s + c.subtotal, 0));
  const tax = r2(concepts.reduce((s, c) => s + c.tax, 0));
  return { concepts, subtotal, tax, total: r2(subtotal + tax) };
}

/** The SAT's month code ("09") and year for a global CFDI of a given day. */
export function globalPeriod(date: string): { periodicity: '01'; months: string; year: number } {
  const [y, m] = date.split('-');
  return { periodicity: '01', months: m, year: Number(y) };
}
