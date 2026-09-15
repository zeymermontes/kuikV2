// Which orders the restaurant accepts by themselves and which wait for a
// person (tenant_ordering.order_approval). Client-safe: the settings form
// reads it too.
//
// Card and online payments are money in hand, so many places auto-accept
// those; a transfer needs someone to check the receipt, and a delivery may
// need someone to look at the address first. An order auto-accepts only when
// BOTH its payment method and its service type say so.

import type { PaymentMethod, ServiceType } from '@/lib/database.types';

export type Approval = 'auto' | 'confirm';

export interface OrderApproval {
  payment: Partial<Record<PaymentMethod, Approval>>;
  service: Partial<Record<ServiceType, Approval>>;
}

const PAYMENTS: PaymentMethod[] = ['cash', 'transfer', 'card', 'onsite', 'online'];
const SERVICES: ServiceType[] = ['pickup', 'delivery', 'dinein'];

export function resolveOrderApproval(raw: unknown): OrderApproval {
  const r = (raw && typeof raw === 'object' ? raw : {}) as { payment?: Record<string, unknown>; service?: Record<string, unknown> };
  const pick = <K extends string>(keys: readonly K[], src: Record<string, unknown> | undefined) => {
    const out: Partial<Record<K, Approval>> = {};
    for (const k of keys) if (src?.[k] === 'auto' || src?.[k] === 'confirm') out[k] = src[k] as Approval;
    return out;
  };
  return { payment: pick(PAYMENTS, r.payment), service: pick(SERVICES, r.service) };
}

/** Unset means "confirm": nothing is accepted by itself until the restaurant says so. */
export function approvalFor(rules: OrderApproval, paymentMethod: string | null, serviceKind: string | null): Approval {
  const p = paymentMethod ? rules.payment[paymentMethod as PaymentMethod] : undefined;
  const s = serviceKind ? rules.service[serviceKind as ServiceType] : undefined;
  // A method the restaurant never configured (or an order without one) is not
  // a reason to skip the check; a rule that is unknown counts as confirm.
  if (paymentMethod && p === undefined) return 'confirm';
  if (serviceKind && s === undefined) return 'confirm';
  if (!paymentMethod && !serviceKind) return 'confirm';
  return (p ?? 'auto') === 'auto' && (s ?? 'auto') === 'auto' ? 'auto' : 'confirm';
}
