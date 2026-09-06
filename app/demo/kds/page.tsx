import { getLocale } from 'next-intl/server';
import { PrintingProvider } from '@/components/pos/PrintingContext';
import { KdsBoard } from '@/components/pos/KdsBoard';
import { demoTickets } from '@/lib/pos/kds-demo';
import { DEMO_TENANT } from '@/lib/demo-tenant';

export const dynamic = 'force-dynamic';

/** The kitchen screen with sample tickets; bumping them stays in memory. */
export default async function DemoKdsPage({ searchParams }: { searchParams: Promise<{ explain?: string }> }) {
  const locale = await getLocale();
  const { explain } = await searchParams;
  return (
    <PrintingProvider db={null} tenantId={DEMO_TENANT.id} userId={null} printers={[]} demo>
      <KdsBoard tenantId={DEMO_TENANT.id} station={null} locale={locale} demo explain={!!explain} initial={demoTickets(DEMO_TENANT.id)} />
    </PrintingProvider>
  );
}
