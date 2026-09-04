'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, Bot, Copy, ListTree, Plus, Trash2, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Card, Field, Input } from '@/components/ui';
import { Drawer } from '@/components/dashboard/menu/Drawer';
import { createFlow, deleteFlow, duplicateFlow, toggleFlow } from '@/app/(dashboard)/whatsapp/flows/actions';
import type { WhatsappFlow } from '@/lib/whatsapp/types';
import type { FlowGraph } from '@/lib/whatsapp/flows/schema';

export interface FlowListItem {
  flow: WhatsappFlow;
  stats: { started: number; completed: number; abandoned: number };
  dropoff: { nodeId: string; stuck: number }[];
}

/** The flows home: create, toggle, open the canvas, read the funnel. */
export function FlowsList({ items }: { items: FlowListItem[] }) {
  const t = useTranslations('whatsapp.flows');
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<FlowListItem | null>(null);
  const [, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> {t('new')}
        </Button>
      </div>

      {items.length === 0 && (
        <Card className="py-10 text-center text-sm text-neutral-500">
          <Workflow className="mx-auto mb-2 h-8 w-8 text-neutral-300" />
          {t('empty')}
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {items.map((item) => (
          <FlowCard
            key={item.flow.id}
            item={item}
            onOpen={() => router.push(`/whatsapp/flows/${item.flow.id}`)}
            onDetail={() => setDetail(item)}
            onToggle={(enabled) => startTransition(async () => {
              await toggleFlow({ id: item.flow.id, enabled });
              router.refresh();
            })}
            onDuplicate={() => startTransition(async () => {
              const res = await duplicateFlow({ id: item.flow.id });
              if (res.ok) router.push(`/whatsapp/flows/${res.id}`);
            })}
            onDelete={() => {
              if (!window.confirm(t('deleteConfirm', { name: item.flow.name }))) return;
              startTransition(async () => {
                await deleteFlow({ id: item.flow.id });
                router.refresh();
              });
            }}
          />
        ))}
      </div>

      {creating && <NewFlowDrawer onClose={() => setCreating(false)} />}
      {detail && <DropoffDrawer item={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function FlowCard({
  item, onOpen, onDetail, onToggle, onDuplicate, onDelete,
}: {
  item: FlowListItem;
  onOpen: () => void;
  onDetail: () => void;
  onToggle: (enabled: boolean) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations('whatsapp.flows');
  const { flow, stats } = item;
  const completion = stats.started > 0 ? Math.round((stats.completed / stats.started) * 100) : null;
  const keywords = flow.triggers.filter((x) => x.kind === 'keyword').map((x) => x.value);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <button onClick={onOpen} className="min-w-0 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{flow.name}</span>
            {flow.mode === 'ai' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                <Bot className="h-3 w-3" /> {t('modeAi')}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            {flow.published_version > 0
              ? t('publishedV', { version: flow.published_version })
              : t('draftOnly')}
            {keywords.length > 0 && <> · {keywords.slice(0, 4).join(', ')}</>}
          </p>
        </button>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-neutral-500">
          <input
            type="checkbox"
            checked={flow.enabled}
            onChange={(e) => onToggle(e.target.checked)}
            className="h-4 w-4 accent-neutral-900"
          />
          {t('enabled')}
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label={t('statStarted')} value={stats.started} />
        <StatTile label={t('statCompleted')} value={stats.completed} suffix={completion !== null ? ` (${completion}%)` : ''} />
        <StatTile label={t('statAbandoned')} value={stats.abandoned} />
      </div>

      <div className="flex items-center gap-1 border-t border-neutral-100 pt-2">
        <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={onOpen}>
          <ListTree className="h-3.5 w-3.5" /> {t('edit')}
        </Button>
        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={onDetail}>
          <BarChart3 className="h-3.5 w-3.5" /> {t('detail')}
        </Button>
        <div className="flex-1" />
        <button onClick={onDuplicate} title={t('duplicate')} className="p-1.5 text-neutral-400 hover:text-neutral-700">
          <Copy className="h-4 w-4" />
        </button>
        <button onClick={onDelete} title={t('delete')} className="p-1.5 text-neutral-400 hover:text-red-600">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </Card>
  );
}

function StatTile({ label, value, suffix = '' }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl bg-neutral-50 px-3 py-2">
      <div className="text-lg font-bold leading-tight">{value}{suffix && <span className="text-xs font-medium text-neutral-500">{suffix}</span>}</div>
      <div className="text-[11px] text-neutral-500">{label}</div>
    </div>
  );
}

function NewFlowDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations('whatsapp.flows');
  const router = useRouter();
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'linear' | 'ai'>('linear');
  const [pending, startTransition] = useTransition();

  const submit = () => startTransition(async () => {
    const res = await createFlow({ name, mode });
    if (res.ok) {
      onClose();
      router.push(`/whatsapp/flows/${res.id}`);
    }
  });

  return (
    <Drawer title={t('new')} onClose={onClose} footer={
      <Button className="w-full" disabled={pending || !name.trim()} onClick={submit}>
        {t('create')}
      </Button>
    }>
      <Field label={t('name')}>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} autoFocus />
      </Field>
      <Field label={t('mode')} hint={t('modeHint')}>
        <div className="grid grid-cols-2 gap-2">
          {(['linear', 'ai'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'rounded-xl border px-3 py-3 text-left text-sm transition',
                mode === m ? 'border-neutral-900 ring-2 ring-neutral-900/10' : 'border-neutral-200 hover:border-neutral-300',
              )}
            >
              <div className="font-semibold">{m === 'ai' ? t('modeAi') : t('modeLinear')}</div>
              <div className="mt-0.5 text-xs text-neutral-500">
                {m === 'ai' ? t('modeAiDesc') : t('modeLinearDesc')}
              </div>
            </button>
          ))}
        </div>
      </Field>
    </Drawer>
  );
}

/** Where diners stall: abandoned/expired runs grouped by the node they were on. */
function DropoffDrawer({ item, onClose }: { item: FlowListItem; onClose: () => void }) {
  const t = useTranslations('whatsapp.flows');

  const labels = useMemo(() => {
    const graph = item.flow.draft_graph as unknown as FlowGraph;
    const map = new Map<string, string>();
    for (const node of graph?.nodes ?? []) {
      if (node.type === 'question') map.set(node.id, node.data.slot.label || node.data.prompt);
      else if (node.type === 'confirm') map.set(node.id, t('nodeConfirm'));
    }
    return map;
  }, [item.flow.draft_graph, t]);

  const max = Math.max(1, ...item.dropoff.map((d) => d.stuck));

  return (
    <Drawer title={t('dropoffTitle', { name: item.flow.name })} onClose={onClose}>
      {item.dropoff.length === 0 ? (
        <p className="text-sm text-neutral-500">{t('dropoffEmpty')}</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-neutral-500">{t('dropoffHint')}</p>
          {item.dropoff.map((d, i) => (
            <div key={d.nodeId}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="truncate">{labels.get(d.nodeId) ?? d.nodeId}</span>
                <span className="font-semibold">{d.stuck}</span>
              </div>
              <div className="h-2 rounded-full bg-neutral-100">
                <div
                  className={cn('h-2 rounded-full', i === 0 ? 'bg-amber-500' : 'bg-neutral-900')}
                  style={{ width: `${Math.round((d.stuck / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
