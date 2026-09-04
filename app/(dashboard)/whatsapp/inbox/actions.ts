'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import { canUse, effectivePlan } from '@/lib/plan';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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

/**
 * How many conversations are parked waiting for a human — the sidebar badge.
 * Deliberately NOT plan-gated: the handoff already happened; hiding the count
 * from a basic tenant would hide their own waiting customers.
 */
export async function getHandoffCount(): Promise<{ total: number }> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  const { count } = await supabase
    .from('whatsapp_conversations')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id)
    .not('handoff_at', 'is', null);
  return { total: count ?? 0 };
}

/**
 * Hand a conversation back to the bot, or take it away. This is the release
 * valve for a handoff: without it, "te atiende una persona" mutes the bot
 * until the stale-chat reset kicks in hours later.
 *
 * Conversations are RLS read-only for staff (the bot runtime owns writes),
 * so this authorizes first and then writes with the service role, scoped to
 * the manager's own tenant.
 */
export async function setConversationBot(input: {
  conversationId: string;
  enabled: boolean;
}): Promise<{ ok: boolean }> {
  const { tenant, subscription } = await requireManager();
  if (!canUse(effectivePlan(subscription), 'wa_bots')) return { ok: false };

  const admin = createAdminClient();
  const { error } = await admin
    .from('whatsapp_conversations')
    .update(
      input.enabled
        ? { bot_enabled: true, handoff_at: null, handoff_by: null }
        : { bot_enabled: false, handoff_at: new Date().toISOString(), handoff_by: 'staff_dashboard' },
    )
    .eq('id', input.conversationId)
    .eq('tenant_id', tenant.id);
  if (!error) revalidatePath('/whatsapp/inbox');
  return { ok: !error };
}
