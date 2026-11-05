import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TenantDevice } from '@/lib/database.types';
import { CODE_TTL_MS, newCode } from './code';

/**
 * Only the hash of a code is stored: a copy of the table gives nobody a way
 * in. The prefix keeps these hashes apart from any other sha256 of the same
 * eight characters.
 */
export function hashCode(code: string): string {
  return createHash('sha256').update(`kuik-device:${code}`).digest('hex');
}

/** A new code and the two columns that remember it. The code is returned once, to be shown. */
export function issueCode(now: number = Date.now()): { code: string; code_hash: string; code_expires_at: string } {
  const code = newCode();
  return { code, code_hash: hashCode(code), code_expires_at: new Date(now + CODE_TTL_MS).toISOString() };
}

/**
 * A device's login needs an address to exist, and this one leads nowhere: no
 * mailbox, nothing is ever sent to it, and it is never shown. The random part
 * is its only content.
 */
const LOGIN_DOMAIN = 'devices.kuik.mx';

/** Whether a login is one of these: read from the claims, which a session cannot edit. */
export const DEVICE_CLAIM = 'kuik_device';

/**
 * Delete a device's login. Its membership, profile and push tokens go with it.
 *
 * Only ever a device's: the id comes from a table, and this is the one place
 * in the product that deletes an account, so it checks for itself that the
 * account is a device before it does. A person's account is never touched.
 */
export async function removeDeviceLogin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error: readError } = await admin.auth.admin.getUserById(userId);
  // Already gone is as good as deleted.
  if (readError?.status === 404) return true;
  if (readError || !data?.user) return false;
  if (data.user.app_metadata?.[DEVICE_CLAIM] !== true) return false;
  const { error } = await admin.auth.admin.deleteUser(userId);
  return !error || error.status === 404;
}

export type RedeemResult =
  | { ok: true; device: TenantDevice; email: string; password: string }
  | { ok: false; reason: 'invalid' | 'failed' };

/**
 * Use a code: create the device's login, make it a member, and hand back the
 * credentials for the one sign-in they will ever be used for.
 *
 * The code is taken first, with a write that only succeeds while the code is
 * still there, so two tablets typing the same code cannot both get in. If
 * anything after that fails the code is put back: a network hiccup must not
 * cost the owner a walk back to the office.
 */
export async function redeemCode(code: string): Promise<RedeemResult> {
  const admin = createAdminClient();
  const hash = hashCode(code);
  const nowIso = new Date().toISOString();

  const { data: found } = await admin
    .from('tenant_devices')
    .select('*')
    .eq('code_hash', hash)
    .gt('code_expires_at', nowIso)
    .maybeSingle<TenantDevice>();
  if (!found) return { ok: false, reason: 'invalid' };

  const { data: taken } = await admin
    .from('tenant_devices')
    .update({ code_hash: null, code_expires_at: null })
    .eq('id', found.id)
    .eq('code_hash', hash)
    .select('id')
    .maybeSingle<{ id: string }>();
  if (!taken) return { ok: false, reason: 'invalid' };

  const putBack = () =>
    admin.from('tenant_devices').update({ code_hash: hash, code_expires_at: found.code_expires_at }).eq('id', found.id).is('code_hash', null);

  const email = `dispositivo-${randomBytes(12).toString('hex')}@${LOGIN_DOMAIN}`;
  const password = randomBytes(32).toString('base64url');
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    // Nothing to confirm, and so nothing is sent.
    email_confirm: true,
    user_metadata: { full_name: found.name },
    app_metadata: { [DEVICE_CLAIM]: true },
  });
  const userId = created?.user?.id;
  if (createError || !userId) {
    await putBack();
    return { ok: false, reason: 'failed' };
  }

  const { error: memberError } = await admin
    .from('tenant_members')
    .insert({ tenant_id: found.tenant_id, user_id: userId, role: found.role, email: null });
  const linkedAt = new Date().toISOString();
  const { data: device, error: deviceError } = memberError
    ? { data: null, error: memberError }
    : await admin
        .from('tenant_devices')
        .update({ user_id: userId, linked_at: linkedAt, last_seen_at: linkedAt })
        .eq('id', found.id)
        .select('*')
        .maybeSingle<TenantDevice>();
  if (memberError || deviceError || !device) {
    await removeDeviceLogin(userId);
    await putBack();
    return { ok: false, reason: 'failed' };
  }

  // Linked again after losing its session: the login it had stops here, so a
  // tablet that was lost or reset cannot come back with the old one.
  if (found.user_id && found.user_id !== userId) await removeDeviceLogin(found.user_id);

  return { ok: true, device, email, password };
}

/** How stale "last seen" may get before it is written again: the hub renders often. */
const SEEN_EVERY_MS = 5 * 60_000;

/** Note that the device is in use, at most once every few minutes. Never throws. */
export async function touchDevice(device: Pick<TenantDevice, 'id' | 'last_seen_at'>): Promise<void> {
  const last = device.last_seen_at ? Date.parse(device.last_seen_at) : 0;
  if (Date.now() - last < SEEN_EVERY_MS) return;
  try {
    await createAdminClient().from('tenant_devices').update({ last_seen_at: new Date().toISOString() }).eq('id', device.id);
  } catch {
    // a missed heartbeat is not worth failing a page for
  }
}
