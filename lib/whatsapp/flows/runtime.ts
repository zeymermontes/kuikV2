import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { runAi } from '@/lib/ai/run';
import { matchGoal } from '../intent';
import { sendMessage } from '../send';
import { botHandoff, type BotContext } from '../actions';
import type { RenderVars } from '../render';
import type { OutboundDraft, WhatsappFlow, WhatsappFlowRun } from '../types';
import { completeGraph, flowBooks, promptDraft, resumeNodeId, slotByKey, spanishSlotParser, stepGraph, type GraphEngineCtx } from './engine';
import type { FlowGraph } from './schema';
import { slotsOf } from './schema';
import { executeActions, getCanned, reservationErrorMessage } from './complete';
import { reservationDayStatus } from '@/lib/reservations/availability';
import { dayUnavailableMessage } from '@/lib/reservations/day';
import {
  createRun, endRun, loadPublishedGraph, loadRun,
  mergeAnswers, plainAnswers, timerDues,
} from './run-store';

/**
 * One diner turn inside a flow: bot.ts hands over the moment a run is active
 * or a flow's triggers match, and this decides who drives (AI or the graph),
 * executes whatever actions fall out, persists the run — timers restarted,
 * answers stamped — and sends the replies.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface FlowTurnParams {
  supabase: Admin;
  conv: { id: string; tenant_id: string; active_flow_run_id: string | null };
  contactId: string;
  botCtx: BotContext;
  vars: RenderVars;
  turn: { text: string; replyId?: string | null };
  /** Enabled + published flows, priority-ordered (they also feed matchGoal). */
  flows: WhatsappFlow[];
  aiEnabled: boolean;
  /** Plan gate: false = no NEW runs and no AI turns; active runs still finish. */
  botsAllowed: boolean;
  /** The goal list the AI shows as "what I can help with". */
  aiGoals: { key: string; name: string; description?: string | null }[];
  /**
   * The message matched a handoff keyword. With AI driving, the model reads
   * it in full and decides; the scripted engine honors it outright.
   */
  wantsHuman?: boolean;
  /** Say these first (e.g. the out-of-hours notice) on the scripted path. */
  pendingReplies: OutboundDraft[];
  /** Online reservations switched on for this restaurant. */
  reservationsEnabled: boolean;
  /** Start THIS flow instead of matching triggers (the "change my booking" path). */
  startFlow?: WhatsappFlow;
}

/** The enabled flow that books a table, if the restaurant has one. */
export async function findBookingFlow(supabase: Admin, flows: WhatsappFlow[]): Promise<WhatsappFlow | null> {
  for (const flow of flows) {
    const graph = await loadPublishedGraph(supabase, flow.id, flow.published_version);
    if (graph && flowBooks(graph)) return flow;
  }
  return null;
}

/** @returns true when the turn was handled here; false = not a flow turn. */
export async function runFlowTurn(params: FlowTurnParams): Promise<boolean> {
  const { supabase, conv, botCtx, vars, turn } = params;

  // Continue the active run, or match a new flow.
  let run: WhatsappFlowRun | null = null;
  let flow: WhatsappFlow | undefined;

  if (conv.active_flow_run_id) {
    run = await loadRun(supabase, conv.active_flow_run_id);
    if (run) {
      const found = params.flows.find((f) => f.id === run!.flow_id);
      flow = found ?? await loadFlowRow(supabase, run.flow_id) ?? undefined;
    }
  }

  if (!run) {
    // Starting a flow is the Pro feature; finishing one you already began is
    // grace (cutting a diner off mid-booking punishes them, not the tenant).
    if (!params.botsAllowed) return false;
    if (params.startFlow) {
      flow = params.startFlow;
    } else {
      const matched = matchGoal(params.flows, turn.text, turn.replyId);
      if (!matched) return false;
      flow = matched.goal as WhatsappFlow;
    }

    // A booking flow while reservations are off: say so NOW, before asking
    // for a party size, a date and a name only to refuse at the end. Same
    // answer whichever engine would have driven.
    if (!params.reservationsEnabled) {
      const wanted = await loadPublishedGraph(supabase, flow.id, flow.published_version);
      if (wanted && flowBooks(wanted)) {
        const off = await getCanned(supabase, conv.tenant_id, 'reservations_off', vars);
        await say(conv.id, [
          ...params.pendingReplies,
          { type: 'text', body: off || dayUnavailableMessage('not_enabled', vars.telefono) },
        ]);
        return true;
      }
    }

    const engine = flow.mode === 'ai' && params.aiEnabled ? 'ai' : 'linear';
    run = await createRun(supabase, {
      flow, conversationId: conv.id, contactId: params.contactId, engine,
    });
    if (!run) return false;
  }
  if (!flow) return false;

  const graph = await loadPublishedGraph(supabase, run.flow_id, run.flow_version);
  if (!graph) {
    await endRun(supabase, run, 'expired', 'graph_missing');
    return false;
  }

  const answers = plainAnswers(run);
  const ctx = botCtx;

  /* ------------------------------------------------------------- AI mode */

  const aiEligible = run.engine === 'ai' && params.aiEnabled && params.botsAllowed;

  if (aiEligible) {
    const slots = slotsOf(graph);
    const needed = slots
      .filter((s) => s.required !== false && answers[s.key] === undefined)
      .map((s) => ({
        key: s.key,
        prompt: promptFor(graph, s.key) ?? s.label,
        options: s.options?.map((o) => o.title),
      }));

    const books = flowBooks(graph);
    const handled = await runAi({
      ctx: { ...ctx, flowRunId: run.id }, text: turn.text, vars, goals: params.aiGoals,
      reservationsEnabled: params.reservationsEnabled,
      collecting: {
        goalName: flow.name,
        needed,
        known: answers,
        runId: run.id,
        slots,
        // A date the model is about to write down gets checked against the
        // calendar first, so "el sábado" on a closed or full Saturday comes
        // back as "ese día no" instead of a refusal after the name.
        validate: books
          ? async (datos) => {
              const dateSlot = slots.find((s) => s.type === 'date');
              const date = dateSlot ? datos[dateSlot.key] : undefined;
              if (typeof date !== 'string' || date === answers[dateSlot!.key]) return { ok: true };
              const partySlot = slots.find((s) => s.type === 'number');
              const party = Number((partySlot && datos[partySlot.key]) ?? (partySlot && answers[partySlot.key]) ?? 1);
              const status = await reservationDayStatus(supabase, { tenantId: conv.tenant_id, branchId: ctx.branchId, date, partySize: party });
              return status.ok
                ? { ok: true }
                : { ok: false, key: dateSlot!.key, detail: `La fecha ${date} NO está disponible: ${dayUnavailableMessage(status.reason)}` };
            }
          : undefined,
      },
    });

    if (handled) {
      await supabase
        .from('whatsapp_flow_runs')
        .update({ last_inbound_at: new Date().toISOString(), nudge_count: 0, ...timerDues(flow) })
        .eq('id', run.id)
        .eq('status', 'active');
      return true;
    }

    // The model's turn failed — but did it finish the run first? Its
    // `finalizar_flujo` (or `pasar_con_humano`) may have ended the run and
    // then the closing reply timed out or got blocked. Restarting the script
    // here re-asked "¿Confirmo…?" for a table already booked. Say the
    // outcome ourselves instead.
    const { data: endedRow } = await supabase
      .from('whatsapp_flow_runs')
      .select('status, action_result, answers')
      .eq('id', run.id)
      .maybeSingle();
    const ended = endedRow as Pick<WhatsappFlowRun, 'status' | 'action_result' | 'answers'> | null;
    if (ended && ended.status !== 'active') {
      const replies: OutboundDraft[] = [...params.pendingReplies];
      if (ended.status === 'completed') {
        for (const r of Object.values(ended.action_result ?? {})) {
          const res = r as { kind?: string; ok?: boolean; error?: string };
          if (res.kind !== 'create_reservation') continue;
          replies.push({
            type: 'text',
            body: res.ok
              ? (await getCanned(supabase, conv.tenant_id, 'reservation_ok', vars)) || 'Tu solicitud quedó registrada. Te confirmamos en unos minutos.'
              : reservationErrorMessage(String(res.error ?? 'failed')),
          });
        }
        replies.push(...completeGraph(graph, plainAnswers({ ...run, answers: ended.answers ?? run.answers }), { vars }).replies);
      } else if (ended.status === 'handoff') {
        const handoffMsg = await getCanned(supabase, conv.tenant_id, 'handoff', vars);
        replies.push({ type: 'text', body: handoffMsg || 'Claro, en un momento te atiende una persona 🙋' });
      }
      if (replies.length > 0) await say(conv.id, replies);
      return true;
    }
  }

  if (run.engine === 'ai') {
    // Either the AI turn just failed, or AI got switched off / the plan
    // lapsed mid-run. Degrade to the script VISIBLY (the inbox shows
    // engine=linear) and resume at the first unanswered question — never
    // from the top: those answers are already stored.
    run = {
      ...run,
      engine: 'linear',
      current_node_id: run.current_node_id ?? resumeNodeId(graph, answers),
    };
    await supabase
      .from('whatsapp_flow_runs')
      .update({ engine: 'linear', current_node_id: run.current_node_id })
      .eq('id', run.id)
      .eq('status', 'active');
  }

  /* --------------------------------------------------------- linear mode */

  // The scripted engine can't weigh "pásame con una persona" against the
  // question it just asked — a human request beats the script.
  if (params.wantsHuman) {
    await botHandoff(ctx, 'keyword');
    await endRun(supabase, run, 'handoff', 'handoff_keyword');
    const handoffMsg = await getCanned(supabase, conv.tenant_id, 'handoff', vars);
    await say(conv.id, [
      ...params.pendingReplies,
      { type: 'text', body: handoffMsg || 'Claro, en un momento te atiende una persona 🙋' },
    ]);
    return true;
  }

  const engineCtx: GraphEngineCtx = { vars, parse: spanishSlotParser(ctx.today) };

  const result = stepGraph(
    graph,
    { currentNodeId: run.current_node_id, answers },
    { text: turn.text, replyId: turn.replyId },
    engineCtx,
  );

  // A date just captured on a booking flow: is that day bookable at all?
  // If not, say why and ask the same question again — the run stays put.
  const dateCapture = result.captured.find((c) => slotByKey(graph, c.key)?.type === 'date');
  if (dateCapture && flowBooks(graph)) {
    const partyKey = slotsOf(graph).find((s) => s.type === 'number')?.key;
    const status = await reservationDayStatus(supabase, {
      tenantId: conv.tenant_id,
      branchId: ctx.branchId,
      date: String(dateCapture.value),
      partySize: partyKey ? Number(result.state.answers[partyKey] ?? 1) : undefined,
    });
    if (!status.ok) {
      const again = promptDraft(graph, run.current_node_id, answers, engineCtx);
      await supabase
        .from('whatsapp_flow_runs')
        .update({ last_inbound_at: new Date().toISOString(), nudge_count: 0, ...timerDues(flow) })
        .eq('id', run.id)
        .eq('status', 'active');
      await say(conv.id, [
        ...params.pendingReplies,
        { type: 'text', body: dayUnavailableMessage(status.reason, vars.telefono) },
        ...(again ? [again] : []),
      ]);
      return true;
    }
  }

  const executed = await executeActions(supabase, ctx, result.actions, vars);
  // Action outcomes ("tu solicitud quedó registrada") read best before the
  // end node's own closing line, which the engine hands over separately.
  const replies = [...params.pendingReplies, ...result.replies, ...executed.replies];
  if (result.endBody) replies.push(result.endBody);

  if (result.outcome) {
    await endRun(
      supabase, run, result.outcome, 'flow_end',
      Object.keys(executed.results).length ? executed.results : undefined,
    );
  } else {
    await supabase
      .from('whatsapp_flow_runs')
      .update({
        current_node_id: result.state.currentNodeId,
        answers: mergeAnswers(run.answers, result.captured),
        last_inbound_at: new Date().toISOString(),
        nudge_count: 0,
        ...timerDues(flow),
      })
      .eq('id', run.id)
      .eq('status', 'active');
  }

  await say(conv.id, replies);
  return true;
}

/** The prompt the graph would use for a slot — the AI shows it as guidance. */
function promptFor(graph: FlowGraph, slotKey: string): string | null {
  for (const node of graph.nodes) {
    if (node.type === 'question' && node.data.slot.key === slotKey) return node.data.prompt;
  }
  return null;
}

async function loadFlowRow(supabase: Admin, flowId: string): Promise<WhatsappFlow | null> {
  const { data } = await supabase.from('whatsapp_flows').select('*').eq('id', flowId).maybeSingle();
  return (data as WhatsappFlow | null) ?? null;
}

async function say(conversationId: string, drafts: OutboundDraft[]): Promise<void> {
  // Three max, but NEVER drop the last draft: it is the question the run now
  // waits on (or the closing line) — trimming it strands the diner.
  const capped = drafts.length <= 3 ? drafts : [...drafts.slice(0, 2), drafts[drafts.length - 1]];
  for (const draft of capped) {
    try {
      await sendMessage(conversationId, draft, 'bot');
    } catch {
      return; // A closed window or failed send is already recorded by sendMessage.
    }
  }
}
