import { getLocale } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import type { Printer } from '@/lib/database.types';
import { PrintingProvider } from '@/components/pos/PrintingContext';
import { isPro } from '@/lib/plan';
import { demoTickets } from '@/lib/pos/kds-demo';
import { KdsBoard } from '@/components/pos/KdsBoard';
import { PosLocked } from '@/components/pos/PosLocked';

export const dynamic = 'force-dynamic';

/** The kitchen screen. `?station=Cocina` pins one station; `?demo=1` shows sample tickets (`&explain=1` in the tutorial). */
export default async function KdsPage({ searchParams }: { searchParams: Promise<{ station?: string; demo?: string; explain?: string }> }) {
  const { tenant, user, subscription } = await requireTenant();
  if (!isPro(subscription)) return <PosLocked title="KDS" />;
  const locale = await getLocale();
  const params = await searchParams;
  const demo = !!params.demo;
  const supabase = await createClient();
  const { data: printers } = await supabase.from('printers').select('*').eq('tenant_id', tenant.id).eq('enabled', true).order('position');
  return (
    <PrintingProvider db={null} tenantId={tenant.id} userId={user.id} printers={(printers ?? []) as Printer[]} demo={demo}>
      <KdsBoard
        tenantId={tenant.id}
        station={params.station ?? null}
        locale={locale}
        demo={demo}
        explain={demo && !!params.explain}
        initial={demo ? demoTickets(tenant.id) : []}
      />
    </PrintingProvider>
  );
}
