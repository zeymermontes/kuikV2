import { requireTenant } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { showDevFeatures } from '@/lib/features';
import { canUseHost, canUsePos } from '@/lib/plan';
import type { MemberRole } from '@/lib/database.types';
import { TerminalHub, type HubTile } from '@/components/pos/TerminalHub';
import { listRegisters } from './actions';
import { ordersBoardEnabled } from '@/lib/orders/board';

export const dynamic = 'force-dynamic';

// Who may open each surface. These mirror the guards on the pages themselves
// (lib/auth.ts and the layouts under app/pos, app/kds, app/host) and `NAV` in
// components/dashboard/Sidebar.tsx: a tile only appears where the page would
// let the person in.
const SERVICE_ROLES: MemberRole[] = ['owner', 'manager', 'cashier', 'waiter'];
const ADMIN_ROLES: MemberRole[] = ['owner', 'manager'];

/**
 * The hub: the first screen of both native apps on every launch, and where
 * the app returns after login. One tile per surface this account can use.
 * With branches, a chooser above the tiles decides which one this device
 * works at (lib/pos/branch.ts): the tiles open with `?branch=` and the
 * device remembers it.
 */
export default async function TerminalPage() {
  const ctx = await requireTenant();
  const { tenant, user, role, support, subscription } = ctx;
  // Support mode resolves the role as owner; the guards treat it the same.
  const has = (roles: MemberRole[]) => support || roles.includes(role);
  const posAllowed = canUsePos(subscription);
  // The POS-side pages are still super-admin only (lib/features.ts); their
  // layouts bounce everyone else to /menu, so the tiles hide for them too.
  const dev = showDevFeatures(ctx);
  // The plan gate is shown, not hidden, to the one role that can lift it: the
  // owner lands on the add-on page (PosLocked) instead of a missing tile.
  const posTile = (key: HubTile['key']): HubTile | null => {
    if (!dev || !has(SERVICE_ROLES)) return null;
    if (posAllowed) return { key };
    return role === 'owner' || support ? { key, locked: true } : null;
  };

  const supabase = await createClient();
  const [{ data: branchRows }, registers, board] = await Promise.all([
    supabase.from('branches').select('id, name, slug').eq('tenant_id', tenant.id).order('position'),
    listRegisters(),
    ordersBoardEnabled(tenant.id),
  ]);
  const branches = (branchRows ?? []) as { id: string; name: string; slug: string }[];

  const tiles = [
    posTile('pos'),
    posTile('kds'),
    // Every role may open the host stand; the plan gate shows as a lock to the owner only, like the POS tiles.
    canUseHost(subscription) ? ({ key: 'host' } as HubTile) : role === 'owner' || support ? ({ key: 'host', locked: true } as HubTile) : null,
    // The Pedidos board: restaurants the super admin switched it on for (0085).
    (board || dev) && has(SERVICE_ROLES) ? ({ key: 'orders' } as HubTile) : null,
    posTile('customer'),
    has(ADMIN_ROLES) ? ({ key: 'admin' } as HubTile) : null,
  ].filter((t): t is HubTile => t !== null);

  return (
    <TerminalHub
      restaurantName={tenant.name}
      userName={user.profile.full_name || user.email || ''}
      tiles={tiles}
      branches={branches}
      registers={registers}
    />
  );
}
