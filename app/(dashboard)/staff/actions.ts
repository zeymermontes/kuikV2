'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner, requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { MemberRole, EmployeeRole } from '@/lib/database.types';
import { EMPLOYEE_ROLES, PERMS, hashPin, isValidPin, type Perm } from '@/lib/employees';

/** Invite a staff member by email. They're linked on their next login. */
export async function inviteStaff(email: string, role: MemberRole) {
  const { tenant } = await requireOwner();
  const e = email.trim().toLowerCase();
  if (!e || role === 'owner') return;
  const supabase = await createClient();
  await supabase
    .from('tenant_invites')
    .upsert(
      { tenant_id: tenant.id, email: e, role, accepted_at: null },
      { onConflict: 'tenant_id,email' },
    );
  revalidatePath('/staff');
}

export async function changeRole(userId: string, role: MemberRole) {
  const { tenant, user } = await requireOwner();
  if (userId === user.id || role === 'owner') return; // can't change the owner
  const supabase = await createClient();
  await supabase
    .from('tenant_members')
    .update({ role })
    .eq('tenant_id', tenant.id)
    .eq('user_id', userId);
  revalidatePath('/staff');
}

export async function removeMember(userId: string) {
  const { tenant, user } = await requireOwner();
  if (userId === user.id) return; // owner can't remove themselves
  const supabase = await createClient();
  await supabase
    .from('tenant_members')
    .delete()
    .eq('tenant_id', tenant.id)
    .eq('user_id', userId);
  revalidatePath('/staff');
}

export async function cancelInvite(id: string) {
  const { tenant } = await requireOwner();
  const supabase = await createClient();
  await supabase.from('tenant_invites').delete().eq('tenant_id', tenant.id).eq('id', id);
  revalidatePath('/staff');
}

// ── Employees (POS people with a PIN; not login accounts) ───────────────────

export interface EmployeeInput {
  id?: string;
  name: string;
  role: EmployeeRole;
  /** A new PIN to set; '' clears it; undefined keeps the current one. */
  pin?: string;
  perms: Record<string, boolean>;
  active: boolean;
}

/** Create or update one employee. The PIN is hashed here and never stored as typed. */
export async function saveEmployee(input: EmployeeInput): Promise<{ error?: string }> {
  const { tenant } = await requireManager();
  const name = input.name.trim();
  if (!name) return { error: 'name' };
  if (!EMPLOYEE_ROLES.includes(input.role)) return { error: 'role' };
  if (input.pin !== undefined && input.pin !== '' && !isValidPin(input.pin)) return { error: 'pin' };
  const perms = Object.fromEntries(Object.entries(input.perms ?? {}).filter(([k, v]) => PERMS.includes(k as Perm) && typeof v === 'boolean'));
  const row: Record<string, unknown> = { tenant_id: tenant.id, name, role: input.role, perms, active: input.active, updated_at: new Date().toISOString() };
  if (input.pin !== undefined) row.pin_hash = input.pin === '' ? null : await hashPin(tenant.id, input.pin);
  const supabase = await createClient();
  if (input.id) {
    const { error } = await supabase.from('employees').update(row).eq('tenant_id', tenant.id).eq('id', input.id);
    if (error) return { error: error.message };
  } else {
    const { count } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('tenant_id', tenant.id);
    const { error } = await supabase.from('employees').insert({ ...row, position: count ?? 0 });
    if (error) return { error: error.message };
  }
  revalidatePath('/staff');
  return {};
}

export async function deleteEmployee(id: string) {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('employees').delete().eq('tenant_id', tenant.id).eq('id', id);
  revalidatePath('/staff');
}
