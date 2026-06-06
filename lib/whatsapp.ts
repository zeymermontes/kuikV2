import { formatPrice } from '@/lib/utils';
import type { PricedOption } from '@/lib/database.types';

export interface CartLine {
  key: string; // unique per product + variant + extras + removals combination
  productId: string;
  name: string;
  basePrice: number | null; // variant price if chosen, else product price
  variantName?: string;
  extras: PricedOption[]; // chosen modifiers / add-ons (priced)
  removed: string[]; // removed ingredients, e.g. ["Cebolla"] (free)
  qty: number;
  note?: string;
}

/** Unit price of one line including its chosen variant and extras. */
export function lineUnitPrice(l: CartLine): number {
  const extras = l.extras.reduce((s, e) => s + e.price, 0);
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

  for (const l of lines) {
    const unit = lineUnitPrice(l);
    const priceStr =
      showPrices && (l.basePrice != null || l.extras.length > 0)
        ? ` — ${money(unit * l.qty)}`
        : '';
    const variant = l.variantName ? ` (${l.variantName})` : '';
    out.push(`• ${l.qty}× ${l.name}${variant}${priceStr}`);
    for (const r of l.removed) out.push(`   − Sin ${r}`);
    for (const e of l.extras) out.push(`   + ${e.name}`);
    if (l.note) out.push(`   _${l.note}_`);
  }

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
