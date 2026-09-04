import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import { createClient } from '@/lib/supabase/server';
import { ProUpsell } from '@/components/dashboard/ProUpsell';
import { InboxShell, type InboxMessage } from '@/components/dashboard/whatsapp/inbox/InboxShell';
import { listConversations, type InboxFilters } from './query';
import type { FlowRunStatus, WhatsappFlowRun } from '@/lib/whatsapp/types';

export const dynamic = 'force-dynamic';

type Search = { q?: string; status?: string; flow?: string; c?: string };

export default async function InboxPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const { tenant, subscription } = await requireManager();
  const t = await getTranslations('whatsapp.inbox');
  const supabase = await createClient();

  if (!isPro(subscription)) {
    return (
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
        <p className="mb-6 text-sm text-neutral-500">{t('subtitle')}</p>
        <ProUpsell feature={t('title')} />
      </div>
    );
  }

  const filters: InboxFilters = {
    q: sp.q ?? '',
    status: (sp.status ?? '') as FlowRunStatus | '',
    flow: sp.flow ?? '',
  };

  // The graphs are only needed to label the selected run's answers — don't
  // ship every flow's full graph JSON just to render the filter dropdown.
  const flowColumns = sp.c ? 'id, name, draft_graph' : 'id, name';
  const [{ items, nextCursor }, { data: flowRows }] = await Promise.all([
    listConversations(supabase, tenant.id, filters),
    supabase.from('whatsapp_flows').select(flowColumns).eq('tenant_id', tenant.id),
  ]);

  // The selected conversation's transcript + its runs.
  let messages: InboxMessage[] = [];
  let runs: WhatsappFlowRun[] = [];
  if (sp.c) {
    const [{ data: msgRows }, { data: runRows }] = await Promise.all([
      supabase
        .from('whatsapp_messages')
        .select('id, direction, origin, body, status, created_at')
        .eq('conversation_id', sp.c)
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('whatsapp_flow_runs')
        .select('*')
        .eq('conversation_id', sp.c)
        .eq('tenant_id', tenant.id)
        .order('started_at', { ascending: false })
        .limit(5),
    ]);
    messages = ((msgRows ?? []) as InboxMessage[]).reverse();
    runs = (runRows ?? []) as WhatsappFlowRun[];
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-neutral-500">{t('subtitle')}</p>
      </div>
      <InboxShell
        tenantId={tenant.id}
        initialItems={items}
        initialCursor={nextCursor}
        filters={filters}
        selectedId={sp.c ?? null}
        messages={messages}
        runs={runs}
        flows={(flowRows ?? []) as unknown as { id: string; name: string; draft_graph?: Record<string, unknown> }[]}
      />
    </div>
  );
}
