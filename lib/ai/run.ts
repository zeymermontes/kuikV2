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
import { checkGrounding, GROUNDING_FALLBACK } from './guard';
import type { ChatMessage } from './types';

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
const TURN_TIMEOUT_MS = 12_000;
const MAX_REPLY_CHARS = 700;

export interface AiTurn {
  ctx: BotContext;
  text: string;
  vars: RenderVars;
  goals: { key: string; name: string; description?: string | null }[];
  /**
   * Present when the model is running a booking rather than answering a
   * question — it then leads the conversation instead of the scripted flow.
   */
  collecting?: {
    goalName: string;
    /** What still has to be established, in the order the restaurant wrote. */
    needed: { key: string; prompt: string; options?: string[] }[];
    /** What has already been pinned down. */
    known: Record<string, unknown>;
    /** The flow run being driven; where answers persist and how the turn ends. */
    runId?: string;
    /** The flow's slot definitions — they become the reply's `datos` schema. */
    slots?: FlowSlot[];
  };
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
  // conversation.
  const { data: history } = await supabase
    .from('whatsapp_messages')
    .select('direction, origin, body')
    .eq('conversation_id', turn.ctx.conversationId)
    .order('created_at', { ascending: false })
    .limit(10);

  const messages: ChatMessage[] = ((history ?? []) as { direction: string; body: string | null }[])
    .reverse()
    .filter((m) => m.body)
    .map((m) => ({ role: m.direction === 'inbound' ? 'user' : 'assistant', content: m.body! }));

  const system = buildSystemPrompt(turn, provider.systemExtra);
  // The reply schema is derived from the flow's own slots, so what the model
  // may write down is exactly what the restaurant drew on the canvas.
  const replySchema = buildReplySchema(turn.collecting?.slots);
  const tools = toolDefinitions(Boolean(turn.collecting), replySchema);
  const signal = AbortSignal.timeout(TURN_TIMEOUT_MS);

  // Everything the tools actually returned this turn. The guard checks the
  // model's reply against exactly this.
  const facts: string[] = [];
  let promptTokens = 0;
  let completionTokens = 0;

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
          if (turn.collecting?.runId && (datos || datos_extra)) {
            await persistRunAnswers(turn.collecting.runId, datos, datos_extra);
          }
          return finish(turn, provider, mensaje, facts, promptTokens, completionTokens, started);
        }
        // Malformed arguments: hand the error back so it can correct itself,
        // rather than dropping the diner's turn on the floor.
        messages.push({
          role: 'tool',
          content: `Argumentos inválidos: ${parsed.error.message.slice(0, 200)}. Vuelve a llamar a responder.`,
          toolCallId: replyCall.id,
          toolName: 'responder',
        });
        continue;
      }

      if (res.toolCalls.length > 0 && round < MAX_TOOL_ROUNDS) {
        for (const call of res.toolCalls) {
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

      return finish(turn, provider, reply, facts, promptTokens, completionTokens, started);
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
  return true;
}

function buildSystemPrompt(turn: AiTurn, extra: string | null): string {
  const options = turn.goals
    .map((g) => `- ${g.name}${g.description ? `: ${g.description}` : ''}`)
    .join('\n');

  const lines = [
    `Eres el asistente de WhatsApp del restaurante "${turn.vars.restaurante ?? ''}".`,
    `Hoy es ${turn.ctx.today}.`,
    '',
    'REGLAS DURAS:',
    '- Responde SIEMPRE en español, breve y cordial, como mensaje de WhatsApp.',
    '- Solo puedes afirmar hechos sobre el restaurante que te haya devuelto una herramienta.',
    '  Lo único que puedes consultar es: el menú y sus precios, los horarios y la ubicación.',
    '- CUALQUIER otra cosa (estacionamiento, wifi, música en vivo, si aceptan mascotas,',
    '  si hay terraza, formas de pago, promociones) NO la sabes. No la inventes ni la niegues:',
    '  di que no tienes ese dato y ofrece preguntarle a alguien del restaurante.',
    '- Si no tienes un dato, dilo con naturalidad y ofrece lo que sí sabes.',
    '- Una reservación queda como SOLICITUD pendiente de confirmar. NUNCA digas',
    '  "reserva confirmada", "quedó confirmada" ni nada parecido: quien confirma es',
    '  el restaurante, después. Di que quedó registrada y que le avisarán.',
    '- Formato de WhatsApp, no Markdown: *negritas* con un asterisco, _cursivas_ con guion bajo.',
    '  Nunca uses **dobles asteriscos**, ## títulos ni tablas: se ven como basura en el chat.',
    '',
    'CÓMO CONVERSAR:',
    '- Nunca supongas un dato ambiguo. Si dice "el 30" y no sabes el mes, pregunta de qué mes.',
    '  Lo mismo con "a las 8" cuando podría ser mañana o noche, o "el viernes" cuando hay dos cerca.',
    '- Si te piden una sugerencia y no tienes el dato exacto, no cortes la conversación:',
    '  consulta lo que sí puedas (horarios, menú) y ofrece una recomendación razonable,',
    '  dejando claro que es una sugerencia y no una regla del restaurante.',
    '- Puedes contestar una pregunta lateral a media reservación y luego retomar donde ibas.',
    '- Una pregunta a la vez. No pidas cuatro datos en el mismo mensaje.',
  ];

  if (turn.collecting) {
    const known = Object.entries(turn.collecting.known)
      .map(([k, v]) => `  - ${k}: ${JSON.stringify(v)}`)
      .join('\n');
    const missing = turn.collecting.needed
      .map((n) => `  - ${n.key}${n.options?.length ? ` (opciones: ${n.options.join(', ')})` : ''}: ${n.prompt}`)
      .join('\n');

    lines.push(
      '',
      `TAREA EN CURSO: ${turn.collecting.goalName}.`,
      known ? `Ya sabes:\n${known}` : 'Todavía no sabes nada del cliente.',
      missing ? `Te falta:\n${missing}` : 'Ya tienes todo.',
      '',
      '- SIEMPRE contesta llamando a `responder`. Es la única forma de hablarle al cliente.',
      '- En `datos` repite todo lo que ya confirmaste, no solo lo de este turno.',
      '  Si el cliente se corrige ("mejor 6"), manda el valor nuevo: reemplaza al anterior.',
      '- Las fechas van como YYYY-MM-DD y las horas como HH:MM de 24 horas.',
      '  Tradúcelas tú a partir de lo que dijo el cliente y de la fecha de hoy.',
      '- Cuando ya tengas todo, LEE EL RESUMEN al cliente y espera su confirmación.',
      turn.collecting.runId
        ? '- Solo después de que confirme, llama a `finalizar_flujo`.'
        : '- Solo después de que confirme, llama a `crear_reserva`.',
    );
  } else {
    lines.push('', 'Puedes ayudar con:', options);
  }

  if (extra) lines.push(`\nTono e indicaciones del restaurante:\n${extra}`);
  return lines.join('\n');
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
