import { getTranslations } from 'next-intl/server';
import { requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { TenantMember, TenantInvite, Employee, TenantDevice } from '@/lib/database.types';
import { DevicesManager, type DeviceView } from '@/components/dashboard/DevicesManager';
import { deviceStatus } from '@/lib/devices/code';
import { EmployeesManager } from '@/components/dashboard/EmployeesManager';
import { StaffManager } from '@/components/dashboard/StaffManager';
import { APP_URL } from '@/lib/config';

export default async function StaffPage() {
  const { tenant, user } = await requireOwner();
  const t = await getTranslations('staff');
  const supabase = await createClient();

  const [{ data: members }, { data: invites }, { data: employees }, { data: deviceRows, error: devicesError }, { data: branches }] = await Promise.all([
    supabase.from('tenant_members').select('*').eq('tenant_id', tenant.id).order('created_at'),
    supabase
      .from('tenant_invites')
      .select('*')
      .eq('tenant_id', tenant.id)
      .is('accepted_at', null)
      .order('created_at'),
    supabase.from('employees').select('*').eq('tenant_id', tenant.id).order('position'),
    // Fails until migration 0100 is applied; the card is then left out.
    supabase.from('tenant_devices').select('*').eq('tenant_id', tenant.id).order('created_at'),
    supabase.from('branches').select('id, name').eq('tenant_id', tenant.id).order('position'),
  ]);

  const devices: DeviceView[] = ((deviceRows ?? []) as TenantDevice[]).map((d) => ({
    id: d.id,
    name: d.name,
    role: d.role,
    branchId: d.branch_id,
    status: deviceStatus(d),
    linked: Boolean(d.user_id),
    codeExpiresAt: d.code_expires_at,
    linkedAt: d.linked_at,
    lastSeenAt: d.last_seen_at,
  }));
  // A linked device is a member like any other, but it is not a person: it
  // is listed with the devices, where it can be revoked, not with the team.
  const deviceLogins = new Set(((deviceRows ?? []) as TenantDevice[]).map((d) => d.user_id).filter(Boolean));
  const people = ((members ?? []) as TenantMember[]).filter((m) => !deviceLogins.has(m.user_id));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
      <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
      <StaffManager
        currentUserId={user.id}
        members={people}
        invites={(invites ?? []) as TenantInvite[]}
        signupUrl={`${APP_URL}/signup`}
      />
      {/* Not offered while its table is missing: a code that cannot be saved helps nobody. */}
      {!devicesError && (
        <div className="mt-8">
          <DevicesManager devices={devices} branches={(branches ?? []) as { id: string; name: string }[]} linkUrl={`${APP_URL}/device`} />
        </div>
      )}
      <div className="mt-8">
        <EmployeesManager employees={(employees ?? []) as Employee[]} />
      </div>
    </div>
  );
}
