'use server';

import { tryTenant } from '@/lib/auth';
import { pendingCounts, type PendingCounts } from '@/lib/pending-counts';
import { sectionsFor } from '@/lib/devices/access';
import type { MemberRole } from '@/lib/database.types';

// Mirrors requireChats() in lib/auth.ts.
const CHAT_ROLES: MemberRole[] = ['owner', 'manager', 'cashier', 'host'];

/**
 * What is waiting for a person that THIS login can do something about: the
 * number on the tab, on the app's icon and on the hub's tiles. The
 * restaurant's counts (lib/pending-counts.ts), minus what the role cannot
 * open, and for a shared device minus the sections it was not given: a
 * kitchen screen has no business counting chats.
 *
 * Asked again on every change, in the background, so it never redirects:
 * a session that ended reads as nothing waiting.
 */
export async function myPending(): Promise<PendingCounts> {
  const ctx = await tryTenant();
  if (!ctx) return { bookings: 0, chats: 0 };
  const [counts, sections] = await Promise.all([pendingCounts(ctx.tenant.id), sectionsFor(ctx.user)]);
  const door = !sections || sections.includes('host');
  const chats = (ctx.support || CHAT_ROLES.includes(ctx.role)) && (!sections || sections.includes('chats'));
  return { bookings: door ? counts.bookings : 0, chats: chats ? counts.chats : 0 };
}
