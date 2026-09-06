'use client';

import { useTransition } from 'react';
import { setTenantAddons, setTenantPlan } from '@/app/(dashboard)/admin/actions';

/** Super-admin per-tenant plan override: the tier and the point-of-sale add-on. */
export function PlanSelect({ tenantId, plan, addons = [], names }: { tenantId: string; plan: 'basic' | 'pro'; addons?: string[]; names: { basic: string; pro: string; pos: string } }) {
  const [pending, start] = useTransition();
  const hasPos = addons.includes('pos');
  return (
    <div className="flex items-center gap-2">
      <select
        defaultValue={plan}
        disabled={pending}
        onChange={(e) => start(async () => setTenantPlan(tenantId, e.target.value as 'basic' | 'pro'))}
        className="rounded-lg border border-neutral-300 px-2 py-1 text-xs"
      >
        <option value="basic">{names.basic}</option>
        <option value="pro">{names.pro}</option>
      </select>
      <label className="flex items-center gap-1 text-xs text-neutral-600" title={names.pos}>
        <input
          type="checkbox"
          defaultChecked={hasPos}
          disabled={pending}
          onChange={(e) => start(async () => setTenantAddons(tenantId, e.target.checked ? [...addons.filter((a) => a !== 'pos'), 'pos'] : addons.filter((a) => a !== 'pos')))}
          className="h-3.5 w-3.5 rounded border-neutral-300"
        />
        POS
      </label>
    </div>
  );
}
