import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendMessage } from '@/lib/whatsapp/send';
import type { BotContext } from '@/lib/whatsapp/actions';
import type { RenderVars } from '@/lib/whatsapp/render';
import { renderTemplate } from '@/lib/whatsapp/render';
import { REGISTRY } from './registry';
import { resolveProvider } from './resolve';
import { withinBudget, recordUsage } from './budget';
import { persistRunAnswers } from '@/lib/whatsapp/flows/run-store';
import type { FlowSlot } from '@/lib/whatsapp/flows/schema';
import { toolDefinitions, runTool, buildReplySchema } from './tools';
import { checkGrounding, claimsBookingDone, GROUNDING_FALLBACK } from './guard';
import type { ChatMessage } from './types';
import { buildRestaurantContext } from './context';
import { buildSystemPrompt } from './prompt';
import { threadFrom, type StoredMessage } from './thread';
import { bookingHold, finalizeHold, summaryOf } from './confirm';
import { promisesFollowUp, summaryFromDiner } from '@/lib/chats/pendings';
import { leavePending } from '@/lib/whatsapp/pendings';
import { describeReservation, type OwnReservation } from '@/lib/whatsapp/actions';
import { completeRunFromAi, reservationErrorMessage } from '@/lib/whatsapp/flows/complete';

/**
 * One AI turn.
 *
 * Strictly additive: every failure path here returns `false`, which tells the
 * caller in bot.ts to fall back to the deterministic flow. The diner never sees
 * an error, a timeout or a budget message — they see the scripted bot.
 */

// A booking turn can legitimately need several: look something up, write a
// fact down, then answer. Three was too tight and truncated mid-booking.
const MAX_TOOL_ROUNDS = 5;
// Finishing a flow is two model calls (finalizar_flujo, then the reply) plus
// the booking itself; 12 s cut that short and the script restarted.
const TURN_TIMEOUT_MS = 25_000;
const MAX_REPLY_CHARS = 700;
// How much of the conversation the model is handed.
const HISTORY_MESSAGES = 10;

export interface AiTurn {
  ctx: BotContext;
  text: string;
  vars: RenderVars;
  goals: { key: string; name: string; description?: string | null }[];
  /**
   * Present when the model is running a booking rather than answering a
   * question — it then leads the conversation instead of the scripted flow.
   */
  /** One question per message (default) or every missing detail in one list. */
  intake?: 'one_by_one' | 'all_at_once';
  collecting?: {
    goalName: string;
    /** What still has to be established, in the order the restaurant wrote. */
    needed: { key: string; prompt: string; options?: string[]; optional?: boolean }[];
    /** What has already been pinned down. */
    known: Record<string, unknown>;
    /** The flow run being driven; where answers persist and how the turn ends. */
    runId?: string;
    /** The flow's slot definitions — they become the reply's `datos` schema. */
    slots?: FlowSlot[];
    /**
     * A last check on what the model wants to write down (a date on a closed
     * day, say). A refusal goes back to the model as a tool error so it
     * rewrites its reply; the value is not persisted.
     */
    validate?: (datos: Record<string, unknown>) => Promise<{ ok: true } | { ok: false; key: string; detail: string; /** What the model should do about it; defaults to asking for another date. */ fix?: string }>;
  };
  /** Online reservations on for this restaurant; off = say so, do not collect. */
  reservationsEnabled?: boolean;
  /** The diner's own upcoming bookings: readable, changeable and cancelable through tools. */
  reservations?: OwnReservation[];
}

/** @returns true when the AI answered; false to fall back to flows. */
export async function runAi(turn: AiTurn): Promise<boolean> {
  const started = Date.now();
  const supabase = createAdminClient();

  const resolved = await resolveProvider(turn.ctx.tenantId);
  if (!resolved.ok) {
    // Record WHY. Returning false silently made a missing API key look exactly
    // like a model with nothing to say — the operator has no way to tell those
    // apart, and only one of them is fixable.
    await logRun(
      turn, 'none', 'none', 'error', 0, 0, started,
      `IA no disponible: ${resolved.detail}`,
    );
    return false;
  }
  const provider = resolved.provider;

  if (!(await withinBudget(turn.ctx.tenantId, provider.ownKey))) {
    await logRun(turn, provider.id, provider.model, 'budget_exceeded', 0, 0, started);
    return false;
  }

  // Recent history, so the model has the thread without being handed the whole
  // conversation — and the restaurant's fact sheet, built alongside it.
  const [{ data: history }, sheet] = await Promise.all([
    supabase
      .from('whatsapp_messages')
      .select('direction, body, status')
      .eq('conversation_id', turn.ctx.conversationId)
      .order('created_at', { ascending: false })
      // A few more than the thread holds: the ones that never left are
      // dropped afterwards (threadFrom) and must not eat into it.
      .limit(HISTORY_MESSAGES + 6),
    buildRestaurantContext({
      tenantId: turn.ctx.tenantId,
      branchId: turn.ctx.branchId,
      vars: turn.vars,
      reservationsEnabled: turn.reservationsEnabled !== false,
    }).catch(() => ({ text: '', facts: [] as string[] })),
  ]);

  const messages: ChatMessage[] = threadFrom((history ?? []) as StoredMessage[], { limit: HISTORY_MESSAGES, current: turn.text });

  const system = buildSystemPrompt({
    restaurant: turn.vars.restaurante ?? '',
    today: turn.ctx.today,
    phone: turn.vars.telefono,
    intake: turn.intake,
    sheet: sheet.text,
    goals: turn.goals,
    reservations: turn.reservations?.map((r) => ({ id: r.id, text: describeReservation(r) })),
    reservationsEnabled: turn.reservationsEnabled,
    collecting: turn.collecting && {
      goalName: turn.collecting.goalName,
      needed: turn.collecting.needed,
      known: turn.collecting.known,
      viaRun: Boolean(turn.collecting.runId),
    },
    extra: provider.systemExtra,
  });
  // The reply schema is derived from the flow's own slots, so what the model
  // may write down is exactly what the restaurant drew on the canvas.
  const replySchema = buildReplySchema(turn.collecting?.slots);
  const tools = toolDefinitions(Boolean(turn.collecting), buildReplySchema(turn.collecting?.slots, true), (turn.reservations?.length ?? 0) > 0);
  const signal = AbortSignal.timeout(TURN_TIMEOUT_MS);

  // What decides whether a booking may be made on this turn (confirm.ts):
  // what was on record before the diner's message, and what the bot last
  // read back to them.
  const slotLabel = (key: string) => turn.collecting?.slots?.find((s) => s.key === key)?.label || key;
  const missingBefore = (turn.collecting?.needed ?? []).filter((n) => !n.optional).map((n) => slotLabel(n.key));
  const lastBotMessage = [...messages].reverse().find((m) => m.role === 'assistant')?.content;
  const holdFor = (name: string, args: Record<string, unknown>): string | null =>
    name === 'finalizar_flujo' && turn.collecting
      ? finalizeHold({ missingRequired: missingBefore, said: turn.text, today: turn.ctx.today })
      : name === 'crear_reserva'
        ? bookingHold({ lastBotMessage, args: args as { customer_name?: string; party_size?: number }, said: turn.text, today: turn.ctx.today })
        : null;

  // Everything the tools actually returned this turn, seeded with the sheet's
  // own figures. The guard checks the model's reply against exactly this.
  const facts: string[] = [...sheet.facts, ...(turn.reservations ?? []).flatMap((r) => describeReservation(r).match(/\d+/g) ?? [])];
  let promptTokens = 0;
  let completionTokens = 0;
  // One rewrite per turn on a refused value; the second time it is dropped
  // silently rather than looping the model.
  let validated = false;
  // Whether finalizar_flujo ran this turn — the only thing that makes
  // "quedó registrada" true.
  let finalized = false;
  // Whether the model wrote down that a person owes this diner an answer,
  // or handed the whole chat to one. If it only SAID so, the pending is
  // written for it once the reply is out (lib/chats/pendings.ts).
  let personTold = false;
  const sent = async (reply: string): Promise<void> => {
    if (personTold || !promisesFollowUp(reply)) return;
    await leavePending(turn.ctx, summaryFromDiner(turn.text)).catch(() => {});
  };

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const res = await REGISTRY[provider.id].provider.chat({
        system,
        messages,
        tools,
        model: provider.model,
        maxTokens: provider.maxTokens,
        temperature: provider.temperature,
        apiKey: provider.apiKey,
        baseUrl: provider.baseUrl,
        signal,
      });

      promptTokens += res.usage.promptTokens;
      completionTokens += res.usage.completionTokens;

      // `responder` is the reply itself, not a lookup: seeing it means the turn
      // is over. Handled before the generic loop so it never gets fed back as a
      // tool result the model would then try to answer again.
      const replyCall = res.toolCalls.find((c) => c.name === 'responder');
      if (replyCall) {
        const parsed = replySchema.safeParse(replyCall.arguments);
        if (parsed.success) {
          const { mensaje, datos, datos_extra } = parsed.data as {
            mensaje: string;
            datos?: Record<string, unknown>;
            datos_extra?: Record<string, string>;
          };
          let toPersist = datos;
          if (datos && turn.collecting?.validate) {
            const verdict = await turn.collecting.validate(datos);
            if (!verdict.ok) {
              if (!validated) {
                validated = true;
                messages.push({ role: 'assistant', content: res.text ?? '', toolCalls: [replyCall] });
                messages.push({
                  role: 'tool',
                  content: `${verdict.detail} ${verdict.fix ?? 'No la anotes en `datos`; díselo al cliente con esas palabras y pide otra fecha. Vuelve a llamar a responder.'}`,
                  toolCallId: replyCall.id,
                  toolName: 'responder',
                });
                continue;
              }
              toPersist = { ...datos };
              delete toPersist[verdict.key];
            }
          }
          if (turn.collecting?.runId && (toPersist || datos_extra)) {
            await persistRunAnswers(turn.collecting.runId, toPersist, datos_extra);
          }
          // The model told the diner the booking is in without calling the
          // tool that books it (seen in production: a "registrada" summary
          // and a run left active, no reservation). Words must match the
          // database: do the finalisation here, or say what is missing.
          if (turn.collecting?.runId && !finalized && claimsBookingDone(mensaje)) {
            // …and not before the diner has seen the details and said yes.
            // If that has not happened, they get the summary now, written
            // here, instead of a claim that is not true.
            if (holdFor('finalizar_flujo', {})) {
              const merged = { ...turn.collecting.known, ...(toPersist ?? {}) };
              const stillMissing = (turn.collecting.slots ?? [])
                .filter((s) => s.required !== false && merged[s.key] === undefined)
                .map((s) => s.label || s.key);
              const honest = stillMissing.length
                ? `Para registrarla me falta: ${stillMissing.join(', ')}. ¿Me lo compartes?`
                : summaryOf(turn.collecting.slots ?? [], merged);
              await logRun(turn, provider.id, provider.model, 'guard_blocked', promptTokens, completionTokens, started, 'claimed done before the summary was confirmed');
              return finish(turn, provider, honest, facts, promptTokens, completionTokens, started, sent);
            }
            const done = await completeRunFromAi(turn.collecting.runId, turn.ctx, turn.vars);
            facts.push(...done.facts);
            if (!done.ok) {
              const honest = done.missing?.length
                ? `Para registrarla me falta: ${done.missing.join(', ')}. ¿Me lo compartes?`
                : done.error
                  ? reservationErrorMessage(done.error)
                  : 'Todavía no pude registrar tu solicitud. Un momento y te atiende una persona.';
              await logRun(turn, provider.id, provider.model, 'guard_blocked', promptTokens, completionTokens, started, 'claimed done without finalizar_flujo');
              return finish(turn, provider, honest, facts, promptTokens, completionTokens, started, sent);
            }
          }
          return finish(turn, provider, mensaje, facts, promptTokens, completionTokens, started, sent);
        }
        // Malformed arguments: hand the error back so it can correct itself,
        // rather than dropping the diner's turn on the floor.
        messages.push({ role: 'assistant', content: res.text ?? '', toolCalls: [replyCall] });
        messages.push({
          role: 'tool',
          content: `Argumentos inválidos: ${parsed.error.message.slice(0, 200)}. Vuelve a llamar a responder.`,
          toolCallId: replyCall.id,
          toolName: 'responder',
        });
        continue;
      }

      if (res.toolCalls.length > 0 && round < MAX_TOOL_ROUNDS) {
        messages.push({ role: 'assistant', content: res.text ?? '', toolCalls: res.toolCalls });
        for (const call of res.toolCalls) {
          // Booking is held until the summary has been read back and
          // answered with a yes; the model is told why and writes the
          // summary instead.
          const hold = holdFor(call.name, call.arguments);
          if (hold) {
            messages.push({ role: 'tool', content: hold, toolCallId: call.id, toolName: call.name });
            continue;
          }
          if (call.name === 'finalizar_flujo') finalized = true;
          if (call.name === 'dejar_pendiente' || call.name === 'pasar_con_humano') personTold = true;
          const outcome = await runTool(call.name, call.arguments, turn.ctx, turn.vars);
          facts.push(...outcome.facts);
          messages.push({
            role: 'tool',
            content: outcome.content,
            toolCallId: call.id,
            toolName: call.name,
          });
        }
        continue;
      }

      // Plain text when `responder` was expected. Some models do this; treat
      // the text as the message rather than losing the turn, and simply keep
      // whatever state we already had.
      const reply = (res.text ?? '').trim();
      if (!reply) {
        // Distinguish the two reasons for silence, because only one of them is
        // fixable by the operator: a reasoning model that ran out of budget
        // mid-thought needs a bigger ceiling, not a different prompt.
        await logRun(
          turn, provider.id, provider.model,
          res.truncated ? 'error' : 'refused',
          promptTokens, completionTokens, started,
          res.truncated ? `respuesta truncada: max_output_tokens=${provider.maxTokens} es muy bajo para ${provider.model}` : undefined,
        );
        return false;
      }

      return finish(turn, provider, reply, facts, promptTokens, completionTokens, started, sent);
    }

    await logRun(turn, provider.id, provider.model, 'error', promptTokens, completionTokens, started, 'tool rounds exhausted');
    return false;
  } catch (err) {
    // Timeout, 5xx, a malformed response — all the same answer: let the
    // deterministic flow handle it.
    await logRun(turn, provider.id, provider.model, 'error', promptTokens, completionTokens, started, String(err).slice(0, 300));
    return false;
  }
}

/**
 * Guard, send, meter, log. Shared by both exits — a structured `responder` call
 * and a plain-text reply — so neither can skip the grounding check.
 */
async function finish(
  turn: AiTurn,
  provider: { id: string; model: string },
  reply: string,
  facts: string[],
  promptTokens: number,
  completionTokens: number,
  started: number,
  /** Runs once the reply has really gone out, with the reply. */
  afterSent?: (reply: string) => Promise<void>,
): Promise<boolean> {
  // The control, not the instruction: a figure the tools never produced means
  // the model made it up, and the reply is discarded.
  const guard = checkGrounding(reply, facts);
  if (!guard.ok) {
    await logRun(turn, provider.id, provider.model, 'guard_blocked', promptTokens, completionTokens, started, `invented: ${guard.invented.join(', ')}`);
    await recordUsage(turn.ctx.tenantId, promptTokens, completionTokens);
    await sendMessage(
      turn.ctx.conversationId,
      { type: 'text', body: renderTemplate(GROUNDING_FALLBACK, turn.vars) },
      'bot',
    );
    return true;
  }

  await sendMessage(
    turn.ctx.conversationId,
    { type: 'text', body: reply.slice(0, MAX_REPLY_CHARS) },
    'bot',
  );
  await recordUsage(turn.ctx.tenantId, promptTokens, completionTokens);
  await logRun(turn, provider.id, provider.model, 'replied', promptTokens, completionTokens, started);
  await afterSent?.(reply);
  return true;
}

async function logRun(
  turn: AiTurn,
  provider: string,
  model: string,
  outcome: string,
  promptTokens: number,
  completionTokens: number,
  started: number,
  error?: string,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from('ai_runs').insert({
    tenant_id: turn.ctx.tenantId,
    conversation_id: turn.ctx.conversationId,
    provider,
    model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    latency_ms: Date.now() - started,
    outcome,
    error: error ?? null,
  });
}
