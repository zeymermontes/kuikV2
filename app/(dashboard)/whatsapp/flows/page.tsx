import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { isPro } from '@/lib/plan';
import { createClient } from '@/lib/supabase/server';
import { ProUpsell } from '@/components/dashboard/ProUpsell';
import { FlowsList, type FlowListItem } from '@/components/dashboard/whatsapp/flows/FlowsList';
import type { WhatsappFlow } from '@/lib/whatsapp/types';

export const dynamic = 'force-dynamic';

export default async function FlowsPage() {
  const { tenant, subscription } = await requireManager();
  const t = await getTranslations('whatsapp.flows');
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

  const [{ data: flowRows }, { data: statRows }, { data: dropRows }] = await Promise.all([
    supabase.from('whatsapp_flows').select('*').eq('tenant_id', tenant.id)
      .order('priority', { ascending: false }),
    supabase.from('whatsapp_flow_stats').select('flow_id, version, started, completed, abandoned')
      .eq('tenant_id', tenant.id),
    supabase.from('whatsapp_flow_dropoff').select('flow_id, current_node_id, stuck')
      .eq('tenant_id', tenant.id),
  ]);

  const stats = new Map<string, { started: number; completed: number; abandoned: number }>();
  for (const row of (statRows ?? []) as { flow_id: string; started: number; completed: number; abandoned: number }[]) {
    const acc = stats.get(row.flow_id) ?? { started: 0, completed: 0, abandoned: 0 };
    acc.started += row.started ?? 0;
    acc.completed += row.completed ?? 0;
    acc.abandoned += row.abandoned ?? 0;
    stats.set(row.flow_id, acc);
  }

  const dropoff = new Map<string, { nodeId: string; stuck: number }[]>();
  for (const row of (dropRows ?? []) as { flow_id: string; current_node_id: string | null; stuck: number }[]) {
    const list = dropoff.get(row.flow_id) ?? [];
    list.push({ nodeId: row.current_node_id ?? '—', stuck: row.stuck });
    dropoff.set(row.flow_id, list);
  }

  const items: FlowListItem[] = ((flowRows ?? []) as WhatsappFlow[]).map((f) => ({
    flow: f,
    stats: stats.get(f.id) ?? { started: 0, completed: 0, abandoned: 0 },
    dropoff: (dropoff.get(f.id) ?? []).sort((a, b) => b.stuck - a.stuck),
  }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-neutral-500">{t('subtitle')}</p>
      </div>
      <FlowsList items={items} />
    </div>
  );
}
