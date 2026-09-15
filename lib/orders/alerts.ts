// How a restaurant wants to be told about orders (tenant_ordering.order_alerts).
// Client-safe: the settings form and the board read it too.

export interface OrderAlerts {
  /** Web push to owners, managers and cashiers when an online order is paid. */
  push: boolean;
  /** Chime and browser notification on the open order board. */
  sound: boolean;
  /** Also push when a WhatsApp order is logged (the guest's message already tells you). */
  whatsappOrders: boolean;
  /** Print the kitchen ticket(s) of a paid order through the print queue. */
  printKitchen: boolean;
  /** Print an "online order" slip on the receipt printer (name, phone, lines). */
  printReceipt: boolean;
  /** Message the guest through the connected WhatsApp when paid / accepted / ready. */
  confirmCustomer: boolean;
  /** Staff numbers the bot messages with each paid order and on escalation. */
  teamPhones: string[];
  /** Minutes a paid order may sit unaccepted before the team is nudged. 0 = never. */
  escalateMinutes: number;
  /** The host stand hears about orders: live toast there, push to the host role. */
  notifyHost: boolean;
  /** The register and the kitchen hear about orders: live toast there, push to cashiers. */
  notifyPos: boolean;
}

export const DEFAULT_ORDER_ALERTS: OrderAlerts = {
  push: true,
  sound: true,
  whatsappOrders: false,
  printKitchen: true,
  printReceipt: false,
  confirmCustomer: true,
  teamPhones: [],
  escalateMinutes: 3,
  notifyHost: true,
  notifyPos: true,
};

/** Who gets the push for an order, per the switches above. Owners and managers always. */
export function orderPushRoles(a: OrderAlerts): ('owner' | 'manager' | 'cashier' | 'host')[] {
  return ['owner', 'manager', ...(a.notifyPos ? (['cashier'] as const) : []), ...(a.notifyHost ? (['host'] as const) : [])];
}

export function resolveOrderAlerts(raw: unknown): OrderAlerts {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof OrderAlerts, unknown>>;
  const bool = (k: keyof OrderAlerts) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (DEFAULT_ORDER_ALERTS[k] as boolean));
  const phones = Array.isArray(r.teamPhones) ? (r.teamPhones as unknown[]).filter((p): p is string => typeof p === 'string' && p.trim() !== '').slice(0, 5) : [];
  const esc = typeof r.escalateMinutes === 'number' && Number.isFinite(r.escalateMinutes) ? Math.max(0, Math.min(60, Math.round(r.escalateMinutes))) : DEFAULT_ORDER_ALERTS.escalateMinutes;
  return {
    push: bool('push'),
    sound: bool('sound'),
    whatsappOrders: bool('whatsappOrders'),
    printKitchen: bool('printKitchen'),
    printReceipt: bool('printReceipt'),
    confirmCustomer: bool('confirmCustomer'),
    teamPhones: phones,
    escalateMinutes: esc,
    notifyHost: bool('notifyHost'),
    notifyPos: bool('notifyPos'),
  };
}
