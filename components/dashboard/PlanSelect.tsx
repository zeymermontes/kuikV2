'use client';

import { useTransition } from 'react';
import { setTenantPlan } from '@/app/(dashboard)/admin/actions';

/** Super-admin per-tenant plan override. */
export function PlanSelect({ tenantId, plan }: { tenantId: string; plan: 'basic' | 'pro' }) {
  const [pending, start] = useTransition();
  return (
    <select
      defaultValue={plan}
      disabled={pending}
      onChange={(e) => start(async () => setTenantPlan(tenantId, e.target.value as 'basic' | 'pro'))}
      className="rounded-lg border border-neutral-300 px-2 py-1 text-xs"
    >
      <option value="basic">Básico</option>
      <option value="pro">Pro</option>
    </select>
  );
}
