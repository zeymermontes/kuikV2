'use server';

import { revalidatePath } from 'next/cache';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { MemberRole } from '@/lib/database.types';

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
