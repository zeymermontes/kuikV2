import { getLocale } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Printer } from '@/lib/database.types';
import { PrintingProvider } from '@/components/pos/PrintingContext';
import { canUsePos } from '@/lib/plan';
import { demoTickets } from '@/lib/pos/kds-demo';
import { KdsBoard } from '@/components/pos/KdsBoard';
import { PosLocked } from '@/components/pos/PosLocked';
import { resolveBranch } from '@/lib/branches';
import { DeviceBranchSync } from '@/components/pos/DeviceBranchSync';

export const dynamic = 'force-dynamic';

/** The kitchen screen. `?station=Cocina` pins one station; `?demo=1` shows sample tickets (`&explain=1` in the tutorial). */
export default async function KdsPage({ searchParams }: { searchParams: Promise<{ station?: string; demo?: string; explain?: string; branch?: string }> }) {
  const { tenant, user, subscription } = await requireTenant();
  if (!canUsePos(subscription)) return <PosLocked title="KDS" />;
  const locale = await getLocale();
  const params = await searchParams;
  const demo = !!params.demo;
  const supabase = await createClient();
  const branch = demo ? null : await resolveBranch(supabase, tenant.id, params.branch);
  const { data: printers } = await (branch
    ? supabase.from('printers').select('*').eq('tenant_id', tenant.id).or(`branch_id.eq.${branch.id},branch_id.is.null`)
    : supabase.from('printers').select('*').eq('tenant_id', tenant.id)
  )
    .eq('enabled', true)
    .order('position');
  return (
    <PrintingProvider db={null} tenantId={tenant.id} userId={user.id} printers={(printers ?? []) as Printer[]} demo={demo}>
      <DeviceBranchSync branch={branch ? { id: branch.id, name: branch.name, slug: branch.slug } : null} />
      <KdsBoard
        tenantId={tenant.id}
        branchId={branch?.id ?? null}
        station={params.station ?? null}
        locale={locale}
        demo={demo}
        explain={demo && !!params.explain}
        initial={demo ? demoTickets(tenant.id) : []}
      />
    </PrintingProvider>
  );
}
