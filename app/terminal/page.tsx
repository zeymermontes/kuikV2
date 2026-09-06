import { requireTenant } from '@/lib/auth';
import { canUsePos } from '@/lib/plan';
import { TerminalModePicker } from '@/components/pos/TerminalModePicker';

export const dynamic = 'force-dynamic';

/** `?pick=1` shows the chooser even when the device already remembers a mode. */
export default async function TerminalPage({ searchParams }: { searchParams: Promise<{ pick?: string }> }) {
  const { tenant, subscription } = await requireTenant();
  const { pick } = await searchParams;
  return (
    <TerminalModePicker
      restaurantName={tenant.name}
      posAllowed={canUsePos(subscription)}
      forcePick={!!pick}
    />
  );
}
