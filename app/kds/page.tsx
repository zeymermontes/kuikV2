import { getLocale } from 'next-intl/server';
import { requireTenant } from '@/lib/auth';
import { KdsBoard } from '@/components/pos/KdsBoard';

export const dynamic = 'force-dynamic';

export default async function KdsPage({ searchParams }: { searchParams: Promise<{ station?: string }> }) {
  const { tenant } = await requireTenant();
  const locale = await getLocale();
  const station = (await searchParams).station ?? null;
  return <KdsBoard tenantId={tenant.id} station={station} locale={locale} />;
}
