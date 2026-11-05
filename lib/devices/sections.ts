// Which of the staff apps a shared device may open (migrations 0100, 0101).
// Pure: the dashboard draws the choices, the server derives the role, the
// hub and the pages check, and the tests run all of it.

import type { DeviceRole, TenantDevice } from '@/lib/database.types';

export type DeviceSection = 'host' | 'chats' | 'orders' | 'pos' | 'kds';

/** In the order they are offered. */
export const DEVICE_SECTIONS: DeviceSection[] = ['host', 'chats', 'orders', 'pos', 'kds'];

/**
 * What each role opens. These mirror the guards on the pages (lib/auth.ts,
 * app/terminal/page.tsx): the door is every role's, the chats are the
 * cashier's and the host's, the register, kitchen and orders are the
 * cashier's and the waiter's.
 */
const ROLE_SECTIONS: Record<DeviceRole, DeviceSection[]> = {
  cashier: ['host', 'chats', 'orders', 'pos', 'kds'],
  waiter: ['host', 'orders', 'pos', 'kds'],
  host: ['host', 'chats'],
};

export function sectionsOfRole(role: DeviceRole): DeviceSection[] {
  return ROLE_SECTIONS[role] ?? [];
}

/** Whatever arrived, as a list of real sections: each once, in the offered order. */
export function cleanSections(input: unknown): DeviceSection[] {
  if (!Array.isArray(input)) return [];
  return DEVICE_SECTIONS.filter((s) => input.includes(s));
}

/**
 * The smallest role that covers a set of sections. Roles are what the
 * database checks, and they come in bundles, so a device may end up with a
 * role wider than what it was given; its sections are what narrow it again.
 */
export function roleForSections(sections: DeviceSection[]): DeviceRole {
  const service = sections.some((s) => s === 'orders' || s === 'pos' || s === 'kds');
  const chats = sections.includes('chats');
  if (service && chats) return 'cashier';
  if (service) return 'waiter';
  return 'host';
}

/**
 * What a device may open: the sections it was given, or all of its role's
 * when it was given none in particular (linked before sections existed).
 * Never more than its role covers, whatever the row says.
 */
export function effectiveSections(d: Pick<TenantDevice, 'role' | 'sections'>): DeviceSection[] {
  const ofRole = sectionsOfRole(d.role);
  if (d.sections == null) return ofRole;
  return cleanSections(d.sections).filter((s) => ofRole.includes(s));
}
