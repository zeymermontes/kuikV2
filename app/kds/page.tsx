import { getLocale } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import { demoTickets } from '@/lib/pos/kds-demo';
import { KdsBoard } from '@/components/pos/KdsBoard';
import { PosLocked } from '@/components/pos/PosLocked';

export const dynamic = 'force-dynamic';

/** The kitchen screen. `?station=Cocina` pins one station; `?demo=1` shows sample tickets (`&explain=1` in the tutorial). */
export default async function KdsPage({ searchParams }: { searchParams: Promise<{ station?: string; demo?: string; explain?: string }> }) {
  const { tenant, subscription } = await requireTenant();
  if (!isPro(subscription)) return <PosLocked title="KDS" />;
  const locale = await getLocale();
  const params = await searchParams;
  const demo = !!params.demo;
  return (
    <KdsBoard
      tenantId={tenant.id}
      station={params.station ?? null}
      locale={locale}
      demo={demo}
      explain={demo && !!params.explain}
      initial={demo ? demoTickets(tenant.id) : []}
    />
  );
}
