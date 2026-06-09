import { getLocale } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import { KdsBoard } from '@/components/pos/KdsBoard';
import { PosLocked } from '@/components/pos/PosLocked';

export const dynamic = 'force-dynamic';

export default async function KdsPage({ searchParams }: { searchParams: Promise<{ station?: string }> }) {
  const { tenant, subscription } = await requireTenant();
  if (!isPro(subscription)) return <PosLocked title="KDS" />;
  const locale = await getLocale();
  const station = (await searchParams).station ?? null;
  return <KdsBoard tenantId={tenant.id} station={station} locale={locale} />;
}
