'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TenantDevice } from '@/lib/database.types';
import { cleanName, isDeviceRole } from '@/lib/devices/code';
import { issueCode, removeDeviceLogin } from '@/lib/devices/server';

/** A code as the owner sees it: once, right after it is generated. */
export interface IssuedCode {
  deviceId: string;
  code: string;
  expiresAt: string;
}

export interface DeviceResult {
  error?: 'name' | 'role' | 'branch' | 'limit' | 'failed';
  issued?: IssuedCode;
}

// Every linked device is a login of its own; a restaurant needs a handful.
const DEVICES_MAX = 50;
// Two codes colliding is a one in a trillion event; the loop is for form.
const CODE_ATTEMPTS = 3;
const UNIQUE_VIOLATION = '23505';

/**
 * Name a device, say what it may do and where, and get the code that joins
 * it. Owner only, like the rest of the team page: a code is a way into the
 * restaurant.
 *
 * Device rows are written with the service role, here and below: the table
 * is read-only to everyone else (0100), and requireOwner() has already
 * established whose restaurant this is. Every write names that restaurant.
 */
export async function createDevice(input: { name: string; role: string; branchId: string | null }): Promise<DeviceResult> {
  const { tenant, user } = await requireOwner();
  const name = cleanName(input.name ?? '');
  if (!name) return { error: 'name' };
  if (!isDeviceRole(input.role)) return { error: 'role' };
  const supabase = await createClient();

  let branchId: string | null = null;
  if (input.branchId) {
    // The branch has to be this restaurant's: the id arrives from the browser.
    const { data } = await supabase.from('branches').select('id').eq('tenant_id', tenant.id).eq('id', input.branchId).maybeSingle();
    if (!data) return { error: 'branch' };
    branchId = input.branchId;
  }

  const { count } = await supabase.from('tenant_devices').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
  if ((count ?? 0) >= DEVICES_MAX) return { error: 'limit' };

  const admin = createAdminClient();
  for (let i = 0; i < CODE_ATTEMPTS; i++) {
    const { code, code_hash, code_expires_at } = issueCode();
    const { data, error } = await admin
      .from('tenant_devices')
      .insert({ tenant_id: tenant.id, name, role: input.role, branch_id: branchId, code_hash, code_expires_at, created_by: user.id })
      .select('id')
      .single<{ id: string }>();
    if (data) {
      revalidatePath('/staff');
      return { issued: { deviceId: data.id, code, expiresAt: code_expires_at } };
    }
    if (error?.code !== UNIQUE_VIOLATION) break;
  }
  return { error: 'failed' };
}

/**
 * A new code for a device that already exists: its first one expired, or the
 * device lost its session (app reinstalled, data cleared). The device keeps
 * its name, role and branch. If it was linked, the login it had keeps working
 * until the new code is used, and stops then.
 */
export async function renewDeviceCode(id: string): Promise<DeviceResult> {
  const { tenant } = await requireOwner();
  const admin = createAdminClient();
  for (let i = 0; i < CODE_ATTEMPTS; i++) {
    const { code, code_hash, code_expires_at } = issueCode();
    const { data, error } = await admin
      .from('tenant_devices')
      .update({ code_hash, code_expires_at })
      .eq('tenant_id', tenant.id)
      .eq('id', id)
      .select('id')
      .maybeSingle<{ id: string }>();
    if (data) {
      revalidatePath('/staff');
      return { issued: { deviceId: data.id, code, expiresAt: code_expires_at } };
    }
    if (error?.code !== UNIQUE_VIOLATION) break;
  }
  return { error: 'failed' };
}

/**
 * Take a device out: its login is deleted, so it is signed out wherever it
 * is, and a code still waiting for it stops working. The login goes first;
 * if that fails the row stays, so the device is never left alive and unlisted.
 */
export async function revokeDevice(id: string): Promise<{ error?: 'failed' }> {
  const { tenant } = await requireOwner();
  const supabase = await createClient();
  const { data: device } = await supabase
    .from('tenant_devices')
    .select('id, user_id')
    .eq('tenant_id', tenant.id)
    .eq('id', id)
    .maybeSingle<Pick<TenantDevice, 'id' | 'user_id'>>();
  if (!device) return {};
  if (device.user_id && !(await removeDeviceLogin(device.user_id))) return { error: 'failed' };
  const { error } = await createAdminClient().from('tenant_devices').delete().eq('tenant_id', tenant.id).eq('id', id);
  revalidatePath('/staff');
  return error ? { error: 'failed' } : {};
}
