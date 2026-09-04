import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendToTenant } from '@/lib/push/send';
import { botCreateReservation, botHandoff, type BotContext } from '../actions';
import { renderTemplate, type RenderVars } from '../render';
import type { OutboundDraft } from '../types';
import { completeGraph, type GraphActionRequest } from './engine';
import { slotsOf } from './schema';
import { endRun, loadPublishedGraph, loadRun, plainAnswers } from './run-store';

/**
 * The one place a flow's action nodes actually DO something.
 *
 * Both exits share it — the linear walk in runtime.ts and the AI's
 * `finalizar_flujo` tool — so a reservation created by the model goes through
 * exactly the same code, checks and wording as one created by the script.
 * (This file exists apart from runtime.ts so lib/ai/tools.ts can import it
 * without creating a tools → runtime → runAi → tools cycle.)
 */

type Admin = ReturnType<typeof createAdminClient>;

export async function getCanned(
  supabase: Admin,
  tenantId: string,
  key: string,
  vars: RenderVars,
): Promise<string> {
  const { data } = await supabase
    .from('whatsapp_canned_replies')
    .select('body')
    .eq('tenant_id', tenantId)
    .eq('key', key)
    .eq('enabled', true)
    .maybeSingle();
  const body = (data as { body: string } | null)?.body;
  return body ? renderTemplate(body, vars) : '';
}

/** Turn a refusal code from the booking RPC into something a diner can act on. */
export function reservationErrorMessage(code: string): string {
  switch (code) {
    case 'slot_full': return 'Ya no tenemos lugar a esa hora. ¿Probamos con otro horario?';
    case 'too_soon': return 'Esa hora está muy próxima para reservar. ¿Buscamos otro momento?';
    case 'too_far': return 'Esa fecha está demasiado lejos para reservar todavía.';
    case 'party_out_of_range': return 'Para ese número de personas, mejor te contactamos directamente.';
    case 'not_enabled': return 'Por ahora no estamos tomando reservaciones en línea.';
    default: return 'No pude registrar la reservación. Un momento y te atiende una persona.';
  }
}

export interface ActionsOutcome {
  replies: OutboundDraft[];
  /** Per-node results, stored on the run for the inbox. */
  results: Record<string, unknown>;
  /** True when some action put the conversation in a human's hands. */
  handoff: boolean;
}

export async function executeActions(
  supabase: Admin,
  ctx: BotContext,
  actions: GraphActionRequest[],
  vars: RenderVars,
): Promise<ActionsOutcome> {
  const replies: OutboundDraft[] = [];
  const results: Record<string, unknown> = {};
  let handoff = false;

  for (const action of actions) {
    switch (action.kind) {
      case 'create_reservation': {
        const a = action.args;
        const outcome = await botCreateReservation(ctx, {
          customer_name: String(a.customer_name ?? ctx.customerName ?? 'Cliente'),
          party_size: Number(a.party_size ?? 2),
          date: String(a.date ?? ctx.today),
          time: String(a.time ?? '20:00'),
          area: a.area !== undefined ? String(a.area) : undefined,
        });
        results[action.nodeId] = outcome.ok
          ? { kind: action.kind, ok: true, reservation_id: outcome.data?.id }
          : { kind: action.kind, ok: false, error: outcome.data?.error };
        replies.push({
          type: 'text',
          body: outcome.ok
            ? (await getCanned(supabase, ctx.tenantId, 'reservation_ok', vars))
              || renderTemplate('Tu solicitud quedó registrada. Te confirmamos en unos minutos.', vars)
            : reservationErrorMessage(String(outcome.data?.error ?? 'failed')),
        });
        break;
      }
      case 'handoff': {
        await botHandoff(ctx, 'flow');
        results[action.nodeId] = { kind: action.kind, ok: true };
        handoff = true;
        break;
      }
      case 'send_menu_link': {
        if (vars.menu_url) replies.push({ type: 'text', body: vars.menu_url });
        results[action.nodeId] = { kind: action.kind, ok: Boolean(vars.menu_url) };
        break;
      }
      case 'notify_staff': {
        // A heads-up push WITHOUT silencing the bot (unlike handoff): the
        // conversation keeps flowing, staff just get pointed at it.
        await sendToTenant(ctx.tenantId, ['owner', 'manager'], (locale) =>
          locale === 'en'
            ? {
                title: 'The bot flagged a conversation',
                body: `${ctx.customerName || 'A customer'} reached a step your flow wants you to see.`,
                tag: `wa-notify-${ctx.conversationId}`,
                url: `/whatsapp/inbox?c=${ctx.conversationId}`,
              }
            : {
                title: 'El bot te dejó un aviso',
                body: `${ctx.customerName || 'Un cliente'} llegó a un paso que tu flujo marca como importante.`,
                tag: `wa-notify-${ctx.conversationId}`,
                url: `/whatsapp/inbox?c=${ctx.conversationId}`,
              },
        ).catch(() => {});
        results[action.nodeId] = { kind: action.kind, ok: true };
        break;
      }
    }
  }

  return { replies, results, handoff };
}

/**
 * `finalizar_flujo`'s backend: the AI says every required slot is confirmed,
 * so walk the graph as if each summary got a yes, run the actions, end the run.
 */
export async function completeRunFromAi(
  runId: string,
  ctx: BotContext,
  vars: RenderVars,
): Promise<{ ok: boolean; detail: string; closing?: string; facts: string[] }> {
  const supabase = createAdminClient();
  const run = await loadRun(supabase, runId);
  if (!run) return { ok: false, detail: 'El flujo ya no está activo.', facts: [] };

  const graph = await loadPublishedGraph(supabase, run.flow_id, run.flow_version);
  if (!graph) return { ok: false, detail: 'El flujo ya no existe.', facts: [] };

  const answers = plainAnswers(run);

  // The tool's description asks the model to wait for every required slot;
  // this is what ENFORCES it. Without it a premature call books a phantom
  // default reservation (2 people, today, 20:00, "Cliente").
  const missing = slotsOf(graph)
    .filter((s) => s.required !== false && answers[s.key] === undefined)
    .map((s) => s.label || s.key);
  if (missing.length > 0) {
    return {
      ok: false,
      detail: `Todavía faltan datos requeridos: ${missing.join(', ')}. Pregúntalos y repórtalos en \`responder\` antes de finalizar.`,
      facts: [],
    };
  }
  const { replies, actions, outcome } = completeGraph(graph, answers, { vars });
  const executed = await executeActions(supabase, ctx, actions, vars);

  // The guard compares the model's reply against these; the values it is
  // about to read back (party size, dates) must count as legitimate.
  const facts = Object.values(answers)
    .flatMap((v) => String(v).match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map((n) => n.replace(',', '.'));

  const failed = Object.values(executed.results).find(
    (r) => (r as { ok?: boolean }).ok === false,
  ) as { error?: string } | undefined;
  if (failed) {
    // The run stays ACTIVE: the model relays the problem ("no hay lugar a las
    // 9") and keeps collecting — ending it here would strand the correction.
    return {
      ok: false,
      detail: `La acción del flujo falló: ${String(failed.error ?? 'error')}. Explícaselo al cliente y ofrece otra opción.`,
      facts,
    };
  }

  await endRun(supabase, run, outcome, 'ai', executed.results);

  const closing = replies.map((r) => r.body).join('\n') || undefined;
  return {
    ok: true,
    detail: 'Flujo completado y acción ejecutada.'
      + (closing ? ` Mensaje de cierre sugerido: ${closing}` : ''),
    closing,
    facts,
  };
}
