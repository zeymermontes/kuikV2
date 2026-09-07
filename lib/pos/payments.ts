'use client';

import type { PosDexie } from './db';
import { deviceBranchId } from './branch';
import { enqueueUpsert, newId, nowISO } from './sync';
import type { Payment, PaymentMethod, PosTab, RegisterShift } from './types';

/** Record a payment against a tab (append-only; split = multiple payments). */
export async function addPayment(
  db: PosDexie,
  args: {
    tenantId: string;
    tab: PosTab;
    method: PaymentMethod;
    amount: number;
    tip?: number;
    tendered?: number | null;
    shiftId: string | null;
    userId: string;
    employeeId?: string | null;
  },
): Promise<void> {
  const t = nowISO();
  const change = args.method === 'cash' && args.tendered != null ? Math.max(0, args.tendered - args.amount) : null;
  const payment: Payment = {
    id: newId(),
    tenant_id: args.tenantId,
    tab_id: args.tab.id,
    method: args.method,
    amount: args.amount,
    tip: args.tip ?? 0,
    tendered: args.tendered ?? null,
    change,
    shift_id: args.shiftId,
    taken_by: args.userId,
    employee_id: args.employeeId ?? null,
    kind: 'sale',
    reason: null,
    refund_of: null,
    detail: null,
    created_at: t,
    updated_at: t,
  };
  await enqueueUpsert(db, 'payments', payment);
}

/**
 * Give money back on a paid sale: a negative payment in the current shift
 * (cash leaves the drawer now, not the one the sale was in), and the sale
 * remembers how much came back. Partial refunds stack.
 */
export async function refundTab(
  db: PosDexie,
  args: {
    tenantId: string;
    tab: PosTab;
    amount: number;
    method: PaymentMethod;
    reason: string | null;
    items: { name: string; qty: number; amount: number }[];
    refundOf: string | null;
    shiftId: string | null;
    userId: string;
    employeeId?: string | null;
  },
): Promise<Payment> {
  const t = nowISO();
  const amount = Math.round(Math.min(args.amount, Math.max(0, args.tab.total - (args.tab.refunded ?? 0))) * 100) / 100;
  if (amount <= 0) throw new Error('nothing_to_refund');
  const payment: Payment = {
    id: newId(),
    tenant_id: args.tenantId,
    tab_id: args.tab.id,
    method: args.method,
    amount: -amount,
    tip: 0,
    tendered: null,
    change: null,
    shift_id: args.shiftId,
    taken_by: args.userId,
    employee_id: args.employeeId ?? null,
    kind: 'refund',
    reason: args.reason,
    refund_of: args.refundOf,
    detail: args.items.length ? { items: args.items } : null,
    created_at: t,
    updated_at: t,
  };
  await enqueueUpsert(db, 'payments', payment);
  await enqueueUpsert(db, 'tabs', { ...args.tab, refunded: Math.round(((args.tab.refunded ?? 0) + amount) * 100) / 100 });
  return payment;
}

export async function paidTotal(db: PosDexie, tabId: string): Promise<number> {
  const pays = await db.payments.where('tab_id').equals(tabId).toArray();
  return pays.reduce((s, p) => s + p.amount, 0);
}

export async function closeTab(db: PosDexie, tab: PosTab, tip = 0): Promise<void> {
  await enqueueUpsert(db, 'tabs', {
    ...tab,
    status: 'paid',
    closed_at: nowISO(),
    tip,
    total: Math.max(0, tab.subtotal - (tab.discount ?? 0) - (tab.promo_discount ?? 0) + tip),
  });
}

// ── Register shifts ──────────────────────────────────────────────────────────
export async function openShift(
  db: PosDexie,
  tenantId: string,
  userId: string,
  openingCash: number,
  register: string | null = null,
): Promise<RegisterShift> {
  const t = nowISO();
  const shift: RegisterShift = {
    id: newId(),
    tenant_id: tenantId,
    branch_id: deviceBranchId(),
    register,
    opened_by: userId,
    opened_at: t,
    opening_cash: openingCash,
    closed_by: null,
    closed_at: null,
    closing_cash: null,
    expected_cash: null,
    over_short: null,
    status: 'open',
    created_at: t,
    updated_at: t,
  };
  return enqueueUpsert(db, 'register_shifts', shift);
}

export async function closeShift(
  db: PosDexie,
  shift: RegisterShift,
  userId: string,
  countedCash: number,
): Promise<RegisterShift> {
  const pays = await db.payments.where('shift_id').equals(shift.id).toArray();
  const cash = pays.filter((p) => p.method === 'cash').reduce((s, p) => s + p.amount, 0);
  const expected = shift.opening_cash + cash;
  return enqueueUpsert(db, 'register_shifts', {
    ...shift,
    status: 'closed',
    closed_by: userId,
    closed_at: nowISO(),
    closing_cash: countedCash,
    expected_cash: expected,
    over_short: countedCash - expected,
  });
}
