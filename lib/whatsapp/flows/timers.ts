import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { canUse, effectivePlan, type PlanTier } from '@/lib/plan';
import { rateLimit, bucketKey } from '@/lib/rate-limit';
import { tenantBaseUrl } from '@/lib/config';
import { renderTemplate, type RenderVars } from '../render';
import { sendMessage } from '../send';
import type { WhatsappFlow, WhatsappFlowRun } from '../types';
import type { FlowGraph } from './schema';
import { promptDraft, resumeNodeId } from './engine';
import { endRun, loadPublishedGraph, plainAnswers } from './run-store';

/**
 * The clock half of a flow: re-ask when the diner goes quiet, close and mark
 * abandoned when they never come back. Runs inside the 5-minute maintenance
 * cron, so "due" means "within the last few minutes", not "to the second".
 *
 * The decision of WHETHER to speak is a pure function so the window/opt-out/
 * plan matrix is unit-testable; everything around it is plumbing.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface TimerSubject {
  /** 'bridge' has no 24h window; anything else must have it open. */
  transport: string | null;
  windowExpiresAt: string | null;
  botEnabled: boolean;
  handedOff: boolean;
  optedOut: boolean;
  blocked: boolean;
  /** Flows are the Pro product; basic tenants get silence, not nudges. */
  botsAllowed: boolean;
}

export type TimerVerdict = 'send' | 'skip_silent' | 'wait_for_window';

/** May the bot speak to this run's diner right now, unprompted? */
export function timerVerdict(s: TimerSubject, now = Date.now()): TimerVerdict {
  if (!s.botsAllowed || !s.botEnabled || s.handedOff || s.optedOut || s.blocked) {
    return 'skip_silent';
  }
  if (s.transport === 'bridge') return 'send';
  const open = s.windowExpiresAt !== null && new Date(s.windowExpiresAt).getTime() > now;
  return open ? 'send' : 'wait_for_window';
}

interface DueRun extends WhatsappFlowRun {
  flow: WhatsappFlow | null;
  conversation: {
    id: string; transport: string | null; window_expires_at: string | null;
    bot_enabled: boolean; handoff_at: string | null;
  } | null;
  contact: { wa_id: string; opted_out: boolean; is_blocked: boolean } | null;
}

const DUE_SELECT =
  '*, flow:whatsapp_flows(*), ' +
  'conversation:whatsapp_conversations(id, transport, window_expires_at, bot_enabled, handoff_at), ' +
  'contact:whatsapp_contacts(wa_id, opted_out, is_blocked)';

async function planByTenant(supabase: Admin, tenantIds: string[]): Promise<Map<string, PlanTier>> {
  const plans = new Map<string, PlanTier>();
  if (tenantIds.length === 0) return plans;
  const { data } = await supabase
    .from('subscriptions')
    .select('tenant_id, status, plan')
    .in('tenant_id', [...new Set(tenantIds)]);
  for (const row of (data ?? []) as { tenant_id: string; status: 'trialing' | 'active' | 'past_due' | 'canceled'; plan: PlanTier }[]) {
    plans.set(row.tenant_id, effectivePlan(row));
  }
  return plans;
}

/**
 * The vars a timer message can interpolate. Deliberately the cheap subset
 * (name + menu URL, one batched query) — hours/address need per-tenant
 * parsing the cron shouldn't pay for; those render empty here.
 */
async function varsByTenant(supabase: Admin, tenantIds: string[]): Promise<Map<string, RenderVars>> {
  const map = new Map<string, RenderVars>();
  if (tenantIds.length === 0) return map;
  const { data } = await supabase
    .from('tenants')
    .select('id, name, subdomain, custom_domain')
    .in('id', [...new Set(tenantIds)]);
  for (const t of (data ?? []) as { id: string; name: string; subdomain: string; custom_domain: string | null }[]) {
    map.set(t.id, { restaurante: t.name, menu_url: tenantBaseUrl(t.subdomain, t.custom_domain) });
  }
  return map;
}

/** One fetch+parse per distinct (flow, version) per tick, not per run. */
function graphLoader(supabase: Admin) {
  const memo = new Map<string, Promise<FlowGraph | null>>();
  return (flowId: string, version: number) => {
    const key = `${flowId}:${version}`;
    let cached = memo.get(key);
    if (!cached) {
      cached = loadPublishedGraph(supabase, flowId, version);
      memo.set(key, cached);
    }
    return cached;
  };
}

function subject(run: DueRun, plans: Map<string, PlanTier>): TimerSubject {
  return {
    transport: run.conversation?.transport ?? null,
    windowExpiresAt: run.conversation?.window_expires_at ?? null,
    botEnabled: run.conversation?.bot_enabled ?? false,
    handedOff: Boolean(run.conversation?.handoff_at),
    optedOut: run.contact?.opted_out ?? true,
    blocked: run.contact?.is_blocked ?? true,
    botsAllowed: canUse(plans.get(run.tenant_id) ?? 'basic', 'wa_bots'),
  };
}

export async function runFlowTimers(supabase: Admin): Promise<{ nudged: number; closed: number }> {
  const nowIso = new Date().toISOString();
  const loadGraph = graphLoader(supabase);
  let nudged = 0;
  let closed = 0;

  /* ---------------------------------------------------------------- nudges */

  const { data: nudgeRows } = await supabase
    .from('whatsapp_flow_runs')
    .select(DUE_SELECT)
    .eq('status', 'active')
    .lte('nudge_due_at', nowIso)
    .limit(50);

  const dueNudges = ((nudgeRows ?? []) as unknown as DueRun[])
    .filter((r) => r.flow && r.nudge_count < r.flow.max_nudges);
  const [plans, vars] = await Promise.all([
    planByTenant(supabase, dueNudges.map((r) => r.tenant_id)),
    varsByTenant(supabase, dueNudges.map((r) => r.tenant_id)),
  ]);

  for (const run of dueNudges) {
    const flow = run.flow!;
    const verdict = timerVerdict(subject(run, plans));

    if (verdict === 'skip_silent') {
      // Don't keep waking up for a run nobody may speak to.
      await supabase.from('whatsapp_flow_runs')
        .update({ nudge_due_at: null }).eq('id', run.id).eq('status', 'active');
      continue;
    }
    if (verdict === 'wait_for_window') {
      // Closed 24h window: don't burn a nudge; check again when the close
      // timer would anyway.
      await supabase.from('whatsapp_flow_runs')
        .update({ nudge_due_at: run.close_due_at }).eq('id', run.id).eq('status', 'active');
      continue;
    }

    // Same caps as live replies: a nudge is still the bot talking.
    const waId = run.contact?.wa_id ?? '';
    const hourly = await rateLimit(bucketKey('wa:bot:h', waId, 3600), 20, 3600);
    const daily = await rateLimit(bucketKey('wa:bot:d', waId, 86400), 60, 86400);
    if (!hourly.ok || !daily.ok) continue;

    const graph = await loadGraph(run.flow_id, run.flow_version);
    const answers = plainAnswers(run);
    // AI-driven runs never set current_node_id; the first unanswered
    // question is where a nudge should point them.
    const nodeId = run.current_node_id ?? (graph ? resumeNodeId(graph, answers) : null);
    const draft = graph
      ? promptDraft(graph, nodeId, answers, { vars: vars.get(run.tenant_id) }, flow.nudge_message)
      : null;
    if (!draft) {
      await supabase.from('whatsapp_flow_runs')
        .update({ nudge_due_at: null }).eq('id', run.id).eq('status', 'active');
      continue;
    }

    try {
      const sent = await sendMessage(run.conversation_id, draft, 'bot');
      if (!sent.ok) continue; // Soft failure: don't burn a nudge; retry next cycle.
      nudged++;
    } catch {
      continue; // Send failures are recorded by sendMessage; try next cycle.
    }

    const count = run.nudge_count + 1;
    await supabase
      .from('whatsapp_flow_runs')
      .update({
        nudge_count: count,
        nudge_due_at: count < flow.max_nudges && flow.nudge_after_minutes
          ? new Date(Date.now() + flow.nudge_after_minutes * 60_000).toISOString()
          : null,
      })
      .eq('id', run.id)
      .eq('status', 'active');
  }

  /* ---------------------------------------------------------------- closes */

  const { data: closeRows } = await supabase
    .from('whatsapp_flow_runs')
    .select(DUE_SELECT)
    .eq('status', 'active')
    .lte('close_due_at', nowIso)
    .limit(50);

  const dueCloses = (closeRows ?? []) as unknown as DueRun[];
  const [closePlans, closeVars] = await Promise.all([
    planByTenant(supabase, dueCloses.map((r) => r.tenant_id)),
    varsByTenant(supabase, dueCloses.map((r) => r.tenant_id)),
  ]);

  for (const run of dueCloses) {
    const flow = run.flow;
    const verdict = timerVerdict(subject(run, closePlans));

    // The farewell is best-effort; the run ends either way.
    if (verdict === 'send' && flow?.close_message) {
      try {
        await sendMessage(
          run.conversation_id,
          { type: 'text', body: renderTemplate(flow.close_message, closeVars.get(run.tenant_id) ?? {}) },
          'bot',
        );
      } catch { /* recorded by sendMessage */ }
    }

    const engaged = Object.keys(run.answers ?? {}).length > 0;
    const ended = await endRun(
      supabase, run,
      engaged ? 'abandoned' : 'expired',
      engaged ? 'timeout' : 'no_engagement',
    );
    if (ended) closed++;
  }

  /* ----------------------------------------------------------------- purge */

  const ninetyDaysAgo = new Date(Date.now() - 90 * 86_400_000).toISOString();
  await supabase
    .from('whatsapp_flow_runs')
    .delete()
    .neq('status', 'active')
    .lt('ended_at', ninetyDaysAgo);

  return { nudged, closed };
}
