import 'server-only';
import type { createClient } from '@/lib/supabase/server';
import type { FlowRunStatus } from '@/lib/whatsapp/types';

/**
 * The inbox listing, shared by the page (first paint) and the load-more
 * server action. Reads run RLS-checked as the signed-in member.
 */

export interface InboxFilters {
  q?: string;
  status?: FlowRunStatus | '';
  flow?: string;
}

export interface ConversationItem {
  id: string;
  contactName: string | null;
  phone: string;
  lastInboundAt: string | null;
  handoffAt: string | null;
  run: { id: string; status: FlowRunStatus; flowId: string; startedAt: string } | null;
}

type Supa = Awaited<ReturnType<typeof createClient>>;

export const PAGE_SIZE = 30;

export async function listConversations(
  supabase: Supa,
  tenantId: string,
  filters: InboxFilters,
  cursor?: string | null,
): Promise<{ items: ConversationItem[]; nextCursor: string | null }> {
  // Run-shaped filters narrow by runs first; the conversation list follows.
  let runConvIds: string[] | null = null;
  if (filters.status || filters.flow) {
    let rq = supabase
      .from('whatsapp_flow_runs')
      .select('conversation_id')
      .eq('tenant_id', tenantId)
      .order('started_at', { ascending: false })
      .limit(300);
    if (filters.status) rq = rq.eq('status', filters.status);
    if (filters.flow) rq = rq.eq('flow_id', filters.flow);
    const { data } = await rq;
    runConvIds = [...new Set(((data ?? []) as { conversation_id: string }[]).map((r) => r.conversation_id))];
    if (runConvIds.length === 0) return { items: [], nextCursor: null };
  }

  let contactIds: string[] | null = null;
  if (filters.q?.trim()) {
    // %_ are LIKE wildcards; ,() and quotes are PostgREST `.or()` syntax.
    const q = filters.q.trim().replace(/[%_,()"'\\]/g, '');
    const { data } = await supabase
      .from('whatsapp_contacts')
      .select('id')
      .eq('tenant_id', tenantId)
      .or(`phone_e164.ilike.%${q}%,profile_name.ilike.%${q}%`)
      .limit(200);
    contactIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    if (contactIds.length === 0) return { items: [], nextCursor: null };
  }

  let query = supabase
    .from('whatsapp_conversations')
    .select('id, last_inbound_at, handoff_at, contact:whatsapp_contacts(profile_name, phone_e164)')
    .eq('tenant_id', tenantId)
    .order('last_inbound_at', { ascending: false, nullsFirst: false })
    .limit(PAGE_SIZE + 1);
  if (cursor) query = query.lt('last_inbound_at', cursor);
  if (runConvIds) query = query.in('id', runConvIds.slice(0, 200));
  if (contactIds) query = query.in('contact_id', contactIds);

  const { data: convRows } = await query;
  const rows = (convRows ?? []) as unknown as {
    id: string; last_inbound_at: string | null; handoff_at: string | null;
    contact: { profile_name: string | null; phone_e164: string } | { profile_name: string | null; phone_e164: string }[] | null;
  }[];

  const page = rows.slice(0, PAGE_SIZE);
  const nextCursor = rows.length > PAGE_SIZE ? page[page.length - 1]?.last_inbound_at ?? null : null;

  // Latest run per conversation, one query for the page.
  const ids = page.map((r) => r.id);
  const runsByConv = new Map<string, ConversationItem['run']>();
  if (ids.length > 0) {
    const { data: runRows } = await supabase
      .from('whatsapp_flow_runs')
      .select('id, conversation_id, status, flow_id, started_at')
      .eq('tenant_id', tenantId)
      .in('conversation_id', ids)
      .order('started_at', { ascending: false })
      // Only the latest run per conversation is shown; a regular with a long
      // history must not ship hundreds of rows per page paint.
      .limit(ids.length * 5);
    for (const run of (runRows ?? []) as { id: string; conversation_id: string; status: FlowRunStatus; flow_id: string; started_at: string }[]) {
      if (!runsByConv.has(run.conversation_id)) {
        runsByConv.set(run.conversation_id, {
          id: run.id, status: run.status, flowId: run.flow_id, startedAt: run.started_at,
        });
      }
    }
  }

  return {
    nextCursor,
    items: page.map((r) => {
      const contact = Array.isArray(r.contact) ? r.contact[0] : r.contact;
      return {
        id: r.id,
        contactName: contact?.profile_name ?? null,
        phone: contact?.phone_e164 ?? '',
        lastInboundAt: r.last_inbound_at,
        handoffAt: r.handoff_at,
        run: runsByConv.get(r.id) ?? null,
      };
    }),
  };
}
