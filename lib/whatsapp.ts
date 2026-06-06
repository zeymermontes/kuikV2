import { formatPrice } from '@/lib/utils';
import type { SelectedOption } from '@/lib/menu-options';

export interface CartLine {
  key: string; // unique per product + chosen options combination
  productId: string;
  name: string;
  categoryName?: string; // section it belongs to (for grouping the WhatsApp ticket)
  basePrice: number | null; // base product price
  selections: SelectedOption[]; // chosen options across all groups (with extra cost)
  qty: number;
  note?: string;
}

/** Unit price of one line: base price + every chosen option's extra cost. */
export function lineUnitPrice(l: CartLine): number {
  const extras = (l.selections ?? []).reduce((s, o) => s + (o.price || 0), 0);
  return (l.basePrice ?? 0) + extras;
}

/** Subtotal of all priced lines. */
export function cartSubtotal(lines: CartLine[]): number {
  return lines.reduce((sum, l) => sum + lineUnitPrice(l) * l.qty, 0);
}

export interface BuildMessageOptions {
  restaurantName: string;
  lines: CartLine[];
  showPrices: boolean;
  currency?: string;
  locale?: string;
  header?: string | null;
  customerName?: string;
  serviceLabel?: string; // localized "Pickup" / "Delivery" / "Dine-in"
  address?: string;
  pickupTime?: string;
  table?: string;
  tipPercent?: number;
  deliveryFee?: number;
}

/**
 * Build the human-readable order text pre-filled into WhatsApp. Includes
 * variants, extras, service type, tip and delivery fee when present.
 */
export function buildOrderMessage(opts: BuildMessageOptions): string {
  const {
    restaurantName,
    lines,
    showPrices,
    currency = 'MXN',
    locale = 'es-MX',
    header,
    customerName,
    serviceLabel,
    address,
    pickupTime,
    table,
    tipPercent,
    deliveryFee,
  } = opts;

  const money = (n: number) => formatPrice(n, currency, locale);
  const out: string[] = [];

  out.push(`*${restaurantName}* — Nuevo pedido`);
  if (header) out.push(header);
  out.push('');

  if (serviceLabel) out.push(`Servicio: ${serviceLabel}`);
  if (customerName) out.push(`Cliente: ${customerName}`);
  if (address) out.push(`Dirección: ${address}`);
  if (pickupTime) out.push(`Hora: ${pickupTime}`);
  if (table) out.push(`Mesa: ${table}`);
  if (serviceLabel || customerName || address || pickupTime || table) out.push('');

  // Group the items by their section (category), preserving first-seen order.
  const groups: { name?: string; lines: CartLine[] }[] = [];
  for (const l of lines) {
    let g = groups.find((x) => x.name === l.categoryName);
    if (!g) {
      g = { name: l.categoryName, lines: [] };
      groups.push(g);
    }
    g.lines.push(l);
  }

  for (const g of groups) {
    if (g.name) out.push(`*${g.name}*`);
    for (const l of g.lines) {
      const unit = lineUnitPrice(l);
      const sel = l.selections ?? [];
      const priceStr =
        showPrices && (l.basePrice != null || sel.length > 0)
          ? ` — ${money(unit * l.qty)}`
          : '';
      out.push(`• ${l.qty}× ${l.name}${priceStr}`);
      for (const o of sel) {
        const extra = showPrices && o.price > 0 ? ` (+${money(o.price)})` : '';
        out.push(`   + ${o.name}${extra}`);
      }
      if (l.note) out.push(`   _${l.note}_`);
    }
    out.push('');
  }
  // drop the trailing blank line before totals
  if (out[out.length - 1] === '') out.pop();

  if (showPrices) {
    const subtotal = cartSubtotal(lines);
    const tip = tipPercent ? (subtotal * tipPercent) / 100 : 0;
    const fee = deliveryFee ?? 0;
    out.push('');
    if (tip || fee) {
      out.push(`Subtotal: ${money(subtotal)}`);
      if (tip) out.push(`Propina (${tipPercent}%): ${money(tip)}`);
      if (fee) out.push(`Envío: ${money(fee)}`);
    }
    out.push(`*Total: ${money(subtotal + tip + fee)}*`);
  }

  return out.join('\n');
}

/** Build the wa.me deep link with the pre-filled message. */
export function buildWhatsappUrl(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
