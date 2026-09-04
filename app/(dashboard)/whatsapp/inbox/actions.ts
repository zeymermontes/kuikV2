'use server';

import { requireManager } from '@/lib/auth';
import { canUse, effectivePlan } from '@/lib/plan';
import { createClient } from '@/lib/supabase/server';
import { listConversations, type ConversationItem, type InboxFilters } from './query';

/** Load-more for the conversation list; same query the page ran. */
export async function fetchConversations(input: {
  filters: InboxFilters;
  cursor: string | null;
}): Promise<{ items: ConversationItem[]; nextCursor: string | null }> {
  const { tenant, subscription } = await requireManager();
  if (!canUse(effectivePlan(subscription), 'wa_bots')) return { items: [], nextCursor: null };
  const supabase = await createClient();
  return listConversations(supabase, tenant.id, input.filters, input.cursor);
}
