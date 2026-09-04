import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { flowGraphSchema, type FlowGraph } from './schema';
import type { FlowRunAnswer, WhatsappFlow, WhatsappFlowRun } from '../types';

/**
 * Reading and writing whatsapp_flow_runs — shared by the bot runtime, the
 * AI tools and the timers cron, so all three agree on what "ending a run"
 * means: guard on status='active' (the cron and an inbound can race), clear
 * the conversation's pointer, bump the durable counters.
 */

type Admin = ReturnType<typeof createAdminClient>;

/** The engine works on bare values; the stored answers carry provenance. */
export function plainAnswers(run: Pick<WhatsappFlowRun, 'answers'>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, a] of Object.entries(run.answers ?? {})) {
    if (a && typeof a === 'object' && 'value' in a) out[key] = (a as FlowRunAnswer).value;
  }
  return out;
}

export async function loadRun(supabase: Admin, runId: string): Promise<WhatsappFlowRun | null> {
  const { data } = await supabase
    .from('whatsapp_flow_runs')
    .select('*')
    .eq('id', runId)
    .eq('status', 'active')
    .maybeSingle();
  return (data as WhatsappFlowRun | null) ?? null;
}

export async function loadFlow(supabase: Admin, flowId: string): Promise<WhatsappFlow | null> {
  const { data } = await supabase
    .from('whatsapp_flows')
    .select('*')
    .eq('id', flowId)
    .maybeSingle();
  return (data as WhatsappFlow | null) ?? null;
}

/** The runnable snapshot — never the draft. */
export async function loadPublishedGraph(
  supabase: Admin,
  flowId: string,
  version: number,
): Promise<FlowGraph | null> {
  const { data } = await supabase
    .from('whatsapp_flow_versions')
    .select('graph')
    .eq('flow_id', flowId)
    .eq('version', version)
    .maybeSingle();
  const graph = (data as { graph: unknown } | null)?.graph;
  if (!graph) return null;
  const parsed = flowGraphSchema.safeParse(graph);
  return parsed.success ? (parsed.data as FlowGraph) : null;
}

/** Due timestamps for a fresh inbound: the diner just spoke, so both clocks restart. */
export function timerDues(flow: Pick<WhatsappFlow, 'nudge_after_minutes' | 'close_after_minutes'>): {
  nudge_due_at: string | null;
  close_due_at: string | null;
} {
  const now = Date.now();
  return {
    nudge_due_at: flow.nudge_after_minutes ? new Date(now + flow.nudge_after_minutes * 60_000).toISOString() : null,
    close_due_at: flow.close_after_minutes ? new Date(now + flow.close_after_minutes * 60_000).toISOString() : null,
  };
}

export async function createRun(
  supabase: Admin,
  params: {
    flow: WhatsappFlow;
    conversationId: string;
    contactId: string;
    engine: 'linear' | 'ai';
  },
): Promise<WhatsappFlowRun | null> {
  const { flow } = params;
  const { data, error } = await supabase
    .from('whatsapp_flow_runs')
    .insert({
      tenant_id: flow.tenant_id,
      flow_id: flow.id,
      flow_version: flow.published_version,
      conversation_id: params.conversationId,
      contact_id: params.contactId,
      engine: params.engine,
      last_inbound_at: new Date().toISOString(),
      ...timerDues(flow),
    })
    .select('*')
    .single();
  // The partial unique index rejects a second active run per conversation —
  // a race between two inbounds; the loser just re-reads.
  if (error) return null;

  const run = data as WhatsappFlowRun;
  await supabase
    .from('whatsapp_conversations')
    .update({ active_flow_run_id: run.id })
    .eq('id', params.conversationId);
  await supabase.rpc('flow_counter_add', {
    p_tenant: flow.tenant_id, p_flow: flow.id, p_version: flow.published_version,
    p_started: 1, p_completed: 0, p_abandoned: 0,
  });
  return run;
}

/** Stamp this turn's captures into the stored answers. */
export function mergeAnswers(
  existing: WhatsappFlowRun['answers'],
  captured: { key: string; value: string | number; source: 'button' | 'text' | 'ai' }[],
): WhatsappFlowRun['answers'] {
  const next = { ...existing };
  const at = new Date().toISOString();
  for (const c of captured) next[c.key] = { value: c.value, at, source: c.source };
  return next;
}

/**
 * The AI reports the FULL set of confirmed slots each turn (replace, not
 * merge — that is what lets "mejor 6" overwrite cleanly). Timestamps of
 * unchanged values survive so the inbox timeline stays honest. A turn with
 * NO `datos` at all (e.g. only volunteered extras) must not touch the
 * answers — replacing with nothing would erase every confirmed slot.
 */
export async function persistRunAnswers(
  runId: string,
  datos: Record<string, unknown> | undefined,
  extra?: Record<string, unknown>,
): Promise<void> {
  const supabase = createAdminClient();
  const run = await loadRun(supabase, runId);
  if (!run) return;

  const at = new Date().toISOString();
  let next = run.answers ?? {};
  if (datos && Object.keys(datos).length > 0) {
    next = {};
    for (const [key, value] of Object.entries(datos)) {
      if (value === undefined || value === null) continue;
      const prev = run.answers?.[key];
      next[key] = prev && String(prev.value) === String(value)
        ? prev
        : { value: value as string | number, at, source: 'ai' };
    }
  }

  const cleanExtra = Object.fromEntries(
    Object.entries(extra ?? {}).filter(([, v]) => typeof v === 'string' && v),
  ) as Record<string, string>;

  await supabase
    .from('whatsapp_flow_runs')
    .update({
      answers: next,
      extra_data: { ...run.extra_data, ...cleanExtra },
      last_inbound_at: at,
    })
    .eq('id', runId)
    .eq('status', 'active');
}

/**
 * Terminal transition. Optimistic: only an ACTIVE run can end, so whichever
 * of cron/inbound gets there first wins and the other becomes a no-op.
 */
export async function endRun(
  supabase: Admin,
  run: Pick<WhatsappFlowRun, 'id' | 'tenant_id' | 'flow_id' | 'flow_version' | 'conversation_id'>,
  status: 'completed' | 'abandoned' | 'expired' | 'handoff' | 'canceled',
  endedReason?: string,
  actionResult?: Record<string, unknown>,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from('whatsapp_flow_runs')
    .update({
      status,
      ended_reason: endedReason ?? null,
      ended_at: now,
      ...(status === 'completed' ? { completed_at: now } : {}),
      ...(actionResult ? { action_result: actionResult } : {}),
      nudge_due_at: null,
      close_due_at: null,
    })
    .eq('id', run.id)
    .eq('status', 'active')
    .select('id');
  const won = Array.isArray(data) && data.length > 0;
  if (!won) return false;

  await supabase
    .from('whatsapp_conversations')
    .update({ active_flow_run_id: null })
    .eq('id', run.conversation_id)
    .eq('active_flow_run_id', run.id);

  if (status === 'completed' || status === 'abandoned' || status === 'expired') {
    await supabase.rpc('flow_counter_add', {
      p_tenant: run.tenant_id, p_flow: run.flow_id, p_version: run.flow_version,
      p_started: 0,
      p_completed: status === 'completed' ? 1 : 0,
      p_abandoned: status === 'completed' ? 0 : 1,
    });
  }
  return true;
}
