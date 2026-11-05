// The one-time code that joins a device to a restaurant (migration 0100), and
// what a device row says about itself. Pure and isomorphic: the dashboard
// formats codes, the server issues and checks them, the tests run both.

import type { DeviceRole, TenantDevice } from '@/lib/database.types';

export const DEVICE_ROLES: DeviceRole[] = ['cashier', 'waiter', 'host'];

export function isDeviceRole(v: unknown): v is DeviceRole {
  return typeof v === 'string' && (DEVICE_ROLES as string[]).includes(v);
}

/**
 * Crockford's base 32: the digits and the letters without I, L, O and U, so
 * a code survives being read aloud or copied from a screen by hand. Thirty-two
 * symbols, so one random byte maps to one symbol with no bias.
 */
export const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const CODE_LENGTH = 8;
/** A code is given to someone who may be at another branch: a day, not minutes. */
export const CODE_TTL_MS = 24 * 60 * 60_000;
export const NAME_MAX = 60;

/** A fresh code. `random` fills a byte array; injected so tests are repeatable. */
export function newCode(random: (bytes: Uint8Array) => void = (b) => void crypto.getRandomValues(b)): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  random(bytes);
  let out = '';
  for (const b of bytes) out += CODE_ALPHABET[b & 31];
  return out;
}

/**
 * What somebody typed, as the code it was meant to be: case, spaces and the
 * dash it is shown with do not count, and the letters the alphabet leaves out
 * are read as the digit they look like (O as 0, I and L as 1).
 */
export function cleanCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
}

export function isCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

/** As it is shown and dictated: two groups of four. */
export function formatCode(code: string): string {
  return code.length > 4 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}

export type DeviceStatus = 'linked' | 'pending' | 'expired';

/**
 * Where a device stands. A linked device with a live code is being linked
 * again (it lost its session): it reads as pending, since the old login
 * stops working the moment the new code is used.
 */
export function deviceStatus(
  d: Pick<TenantDevice, 'user_id' | 'code_hash' | 'code_expires_at'>,
  now: number = Date.now(),
): DeviceStatus {
  const live = Boolean(d.code_hash && d.code_expires_at && Date.parse(d.code_expires_at) > now);
  if (live) return 'pending';
  return d.user_id ? 'linked' : 'expired';
}

/** A device's name as stored: trimmed, single-spaced, capped. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}
