import { requireTenant } from '@/lib/auth';
import { PosTerminal } from '@/components/pos/PosTerminal';

export const dynamic = 'force-dynamic';

export default async function PosPage() {
  const { tenant, user } = await requireTenant();
  return <PosTerminal tenantId={tenant.id} userId={user.id} />;
}
