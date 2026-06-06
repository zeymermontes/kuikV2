import { getTranslations } from 'next-intl/server';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TenantMember, TenantInvite } from '@/lib/database.types';
import { StaffManager } from '@/components/dashboard/StaffManager';
import { APP_URL } from '@/lib/config';

export default async function StaffPage() {
  const { tenant, user } = await requireOwner();
  const t = await getTranslations('staff');
  const supabase = await createClient();

  const [{ data: members }, { data: invites }] = await Promise.all([
    supabase.from('tenant_members').select('*').eq('tenant_id', tenant.id).order('created_at'),
    supabase
      .from('tenant_invites')
      .select('*')
      .eq('tenant_id', tenant.id)
      .is('accepted_at', null)
      .order('created_at'),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <StaffManager
        currentUserId={user.id}
        members={(members ?? []) as TenantMember[]}
        invites={(invites ?? []) as TenantInvite[]}
        signupUrl={`${APP_URL}/signup`}
      />
    </div>
  );
}
