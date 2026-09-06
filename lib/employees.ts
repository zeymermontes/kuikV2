// Employees of a restaurant as the POS knows them: a name, a role, a PIN and
// what they may do. Pure and isomorphic (the dashboard hashes PINs on the
// server, the POS verifies them on the device, offline), so nothing here
// touches a database.

import type { Employee, EmployeeRole } from '@/lib/database.types';

/** Things a register asks permission for. */
export type Perm = 'discount' | 'void' | 'shift' | 'drawer' | 'history' | 'refund';
export const PERMS: Perm[] = ['discount', 'void', 'shift', 'drawer', 'history', 'refund'];

/** What each role may do unless the manager overrides it per person. */
export const ROLE_PERMS: Record<EmployeeRole, Record<Perm, boolean>> = {
  manager: { discount: true, void: true, shift: true, drawer: true, history: true, refund: true },
  cashier: { discount: true, void: false, shift: true, drawer: true, history: true, refund: false },
  waiter: { discount: false, void: false, shift: false, drawer: false, history: false, refund: false },
};

export const EMPLOYEE_ROLES: EmployeeRole[] = ['manager', 'cashier', 'waiter'];

/** Whether an employee may do `perm`: their own override first, else their role's default. */
export function can(emp: Pick<Employee, 'role' | 'perms'> | null | undefined, perm: Perm): boolean {
  if (!emp) return false;
  const own = emp.perms?.[perm];
  if (typeof own === 'boolean') return own;
  return ROLE_PERMS[emp.role]?.[perm] ?? false;
}

export const PIN_MIN = 4;
export const PIN_MAX = 6;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN},${PIN_MAX}}$`).test(pin);
}

/**
 * The stored form of a PIN: sha256("<tenant>:<pin>") as hex. Salted with the
 * tenant so the same PIN at two restaurants is not the same hash. A 4-digit
 * PIN can be brute-forced offline by anyone holding the hash, which is the
 * restaurant's own staff; that is the same bar every register sets, and the
 * hash still keeps PINs out of plain sight in the database and the device.
 */
export async function hashPin(tenantId: string, pin: string): Promise<string> {
  const data = new TextEncoder().encode(`${tenantId}:${pin}`);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The employee whose PIN this is, among `candidates`; null when none matches. */
export async function findByPin(tenantId: string, pin: string, candidates: Employee[]): Promise<Employee | null> {
  if (!isValidPin(pin)) return null;
  const h = await hashPin(tenantId, pin);
  return candidates.find((e) => e.active && e.pin_hash === h) ?? null;
}

/** Initials for an avatar: "Ana López" → "AL". */
export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/** Minutes worked in one clock entry (open entries count up to `now`). */
export function entryMinutes(e: { clock_in: string; clock_out: string | null }, now: Date = new Date()): number {
  const start = new Date(e.clock_in).getTime();
  const end = e.clock_out ? new Date(e.clock_out).getTime() : now.getTime();
  return Math.max(0, Math.round((end - start) / 60_000));
}
