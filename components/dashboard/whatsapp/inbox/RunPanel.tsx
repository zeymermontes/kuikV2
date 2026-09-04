'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowGraph } from '@/lib/whatsapp/flows/schema';
import type { WhatsappFlowRun } from '@/lib/whatsapp/types';
import { RUN_STATUS_STYLE } from './ConversationList';
import type { InboxFlowRef } from './InboxShell';

/**
 * The right-hand answer to "¿hasta dónde llegó?": which flow, every captured
 * answer with its timestamp and source, the node the run rests on, and what
 * the timers will do next.
 */
export function RunPanel({ runs, flows }: { runs: WhatsappFlowRun[]; flows: InboxFlowRef[] }) {
  const t = useTranslations('whatsapp.inbox');
  const run = runs[0];

  if (!run) {
    return <p className="p-5 text-sm text-neutral-400">{t('noRun')}</p>;
  }

  return (
    <div className="space-y-4 p-4">
      <RunDetail run={run} flows={flows} />
      {runs.length > 1 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {t('previousRuns')}
          </div>
          <div className="space-y-1.5">
            {runs.slice(1).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-2 text-xs">
                <span className="truncate">{flowName(flows, r.flow_id)}</span>
                <span className={cn('ml-2 shrink-0 rounded-full px-1.5 py-0.5 font-medium', RUN_STATUS_STYLE[r.status])}>
                  {t(`status_${r.status}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function flowName(flows: InboxFlowRef[], id: string): string {
  return flows.find((f) => f.id === id)?.name ?? '—';
}

function RunDetail({ run, flows }: { run: WhatsappFlowRun; flows: InboxFlowRef[] }) {
  const t = useTranslations('whatsapp.inbox');
  const flow = flows.find((f) => f.id === run.flow_id);

  const nodeLabels = useMemo(() => {
    const graph = flow?.draft_graph as unknown as FlowGraph | undefined;
    const map = new Map<string, string>();
    for (const node of graph?.nodes ?? []) {
      if (node.type === 'question') map.set(node.id, node.data.slot.label || node.data.slot.key);
      if (node.type === 'confirm') map.set(node.id, t('nodeConfirm'));
    }
    return map;
  }, [flow, t]);

  const slotLabels = useMemo(() => {
    const graph = flow?.draft_graph as unknown as FlowGraph | undefined;
    const map = new Map<string, string>();
    for (const node of graph?.nodes ?? []) {
      if (node.type === 'question') map.set(node.data.slot.key, node.data.slot.label || node.data.slot.key);
    }
    return map;
  }, [flow]);

  const answers = Object.entries(run.answers ?? {})
    .sort(([, a], [, b]) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const extras = Object.entries(run.extra_data ?? {});
  const reservationId = findReservationId(run.action_result);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{flow?.name ?? '—'}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', RUN_STATUS_STYLE[run.status])}>
            {t(`status_${run.status}`)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-400">
          {run.engine === 'ai' && (
            <span className="inline-flex items-center gap-1 text-violet-600"><Bot className="h-3 w-3" /> {t('engineAi')}</span>
          )}
          <span>{new Date(run.started_at).toLocaleString()}</span>
        </div>
      </div>

      {/* Captured answers, one by one, in the order they landed */}
      <div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {t('answers')}
        </div>
        {answers.length === 0 ? (
          <p className="text-xs text-neutral-400">{t('noAnswers')}</p>
        ) : (
          <div className="space-y-0">
            {answers.map(([key, a], i) => (
              <div key={key} className="relative flex gap-3 pb-3">
                {i < answers.length - 1 && (
                  <div className="absolute left-[5px] top-3 h-full w-px bg-neutral-200" />
                )}
                <div className="relative mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-neutral-900" />
                <div className="min-w-0">
                  <div className="text-xs text-neutral-500">{slotLabels.get(key) ?? key}</div>
                  <div className="truncate text-sm font-medium">{String(a.value)}</div>
                  <div className="text-[10px] text-neutral-400">
                    {new Date(a.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {' · '}
                    {t(`source_${a.source}`)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {extras.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            {t('extraData')}
          </div>
          <div className="space-y-1">
            {extras.map(([k, v]) => (
              <div key={k} className="rounded-lg bg-violet-50 px-3 py-1.5 text-xs">
                <span className="font-medium text-violet-700">{k}:</span>{' '}
                <span className="text-violet-900">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {run.status === 'active' && (
        <div className="space-y-1.5 rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
          {run.current_node_id && (
            <div className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-neutral-400" />
              {t('waitingOn', { node: nodeLabels.get(run.current_node_id) ?? run.current_node_id })}
            </div>
          )}
          {run.nudge_due_at && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-neutral-400" />
              {t('nudgeAt', { time: new Date(run.nudge_due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
            </div>
          )}
          {run.close_due_at && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-neutral-400" />
              {t('closeAt', { time: new Date(run.close_due_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}
            </div>
          )}
        </div>
      )}

      {reservationId && (
        <a href="/reservations" className="block rounded-xl bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-100">
          {t('reservationCreated')}
        </a>
      )}
      {run.ended_reason && run.status !== 'completed' && (
        <p className="text-[11px] text-neutral-400">{t('endedReason', { reason: run.ended_reason })}</p>
      )}
    </div>
  );
}

function findReservationId(result: Record<string, unknown> | null): string | null {
  if (!result) return null;
  for (const value of Object.values(result)) {
    const id = (value as { reservation_id?: string } | null)?.reservation_id;
    if (id) return id;
  }
  return null;
}
