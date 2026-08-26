import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

import { parseWeekHours, isOpenNowIn, todayHoursIn, mapHref } from '@/lib/hours';
import { todayInTz } from '@/lib/time';
import { tenantBaseUrl } from '@/lib/config';
import { rateLimit, bucketKey } from '@/lib/rate-limit';
import { normalizeText, parseSpanishDate, parseSpanishTime, parsePartySize } from './parse';
import { matchGoal, buildMenu, type MatchableGoal } from './intent';
import { renderTemplate, type RenderVars } from './render';
import { step, type FlowDef, type FlowState, type Slot } from './flow';
import { botCreateReservation, botHandoff, type BotContext } from './actions';
import { sendMessage } from './send';
import { runAi } from '@/lib/ai/run';
import type { OutboundDraft } from './types';

/**
 * Decides what — if anything — the bot says back.
 *
 * The most important logic here is about staying quiet. Under Coexistence the
 * restaurant is using the same number from their phone, so the bot must never
 * talk over a human, never answer its own messages, and never keep going once
 * someone has taken over.
 */

export interface BotTurn {
  tenantId: string;
  conversationId: string;
  text: string;
  replyId?: string | null;
}

export async function runBot(turn: BotTurn): Promise<void> {
  const supabase = createAdminClient();

  const { data: convRow } = await supabase
    .from('whatsapp_conversations')
    .select('id, tenant_id, branch_id, phone_number_id, bot_enabled, handoff_at, active_goal_id, state, contact:whatsapp_contacts(wa_id, opted_out, is_blocked, profile_name)')
    .eq('id', turn.conversationId)
    .maybeSingle();
  if (!convRow) return;

  const conv = convRow as unknown as {
    id: string; tenant_id: string; branch_id: string | null; phone_number_id: string;
    bot_enabled: boolean; handoff_at: string | null; active_goal_id: string | null;
    state: Record<string, unknown>;
    contact: { wa_id: string; opted_out: boolean; is_blocked: boolean; profile_name: string | null }
           | { wa_id: string; opted_out: boolean; is_blocked: boolean; profile_name: string | null }[];
  };
  const contact = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact;
  if (!contact || contact.opted_out || contact.is_blocked) return;

  // A human is already on this conversation — usually because the owner
  // replied from their own phone. Say nothing.
  if (!conv.bot_enabled || conv.handoff_at) return;

  const { data: settingsRow } = await supabase
    .from('whatsapp_settings')
    .select('*')
    .eq('tenant_id', turn.tenantId)
    .maybeSingle();
  const settings = settingsRow as {
    enabled: boolean; bot_enabled: boolean; ai_enabled: boolean; away_enabled: boolean;
    handoff_keywords: string[]; optout_keywords: string[];
    max_bot_replies_per_hour: number; max_bot_replies_per_day: number;
    greet_cooldown_seconds: number;
  } | null;
  if (!settings?.enabled || !settings.bot_enabled) return;

  const text = normalizeText(turn.text);

  // Opting out has to work before anything else does.
  if (settings.optout_keywords.some((k) => text.includes(normalizeText(k)))) {
    await supabase
      .from('whatsapp_contacts')
      .update({ opted_out: true })
      .eq('tenant_id', turn.tenantId)
      .eq('wa_id', contact.wa_id);
    await say(conv.id, [{ type: 'text', body: await canned(supabase, turn.tenantId, 'optout_ack', {}) }]);
    return;
  }

  if (settings.handoff_keywords.some((k) => text.includes(normalizeText(k)))) {
    const ctx = await buildContext(supabase, conv, contact.wa_id, contact.profile_name);
    await botHandoff(ctx, 'keyword');
    await say(conv.id, [{ type: 'text', body: await canned(supabase, turn.tenantId, 'handoff', {}) }]);
    return;
  }

  // Caps that protect the AI bill AND the number's quality rating, which is the
  // one asset a restaurant cannot buy back once Meta downgrades it.
  const hourly = await rateLimit(bucketKey('wa:bot:h', contact.wa_id, 3600), settings.max_bot_replies_per_hour, 3600);
  const daily = await rateLimit(bucketKey('wa:bot:d', contact.wa_id, 86400), settings.max_bot_replies_per_day, 86400);
  if (!hourly.ok || !daily.ok) {
    const ctx = await buildContext(supabase, conv, contact.wa_id, contact.profile_name);
    await botHandoff(ctx, 'budget');
    return;
  }

  const ctx = await buildContext(supabase, conv, contact.wa_id, contact.profile_name);
  const { vars, open } = await buildVars(supabase, turn.tenantId, conv.branch_id);

  const { data: goalRows } = await supabase
    .from('whatsapp_goals')
    .select('*')
    .eq('tenant_id', turn.tenantId)
    .eq('enabled', true)
    .order('priority', { ascending: false });
  const goals = (goalRows ?? []) as (MatchableGoal & {
    resolver: string; reply_body: string | null; flow: FlowDef | null; action: string | null;
  })[];

  // Out of hours, say so — but keep going. A booking request at 2am should
  // still book; replacing the whole reply with "we're closed" is the mistake
  // that makes a bot feel broken.
  const replies: OutboundDraft[] = [];
  if (settings.away_enabled && !open) {
    const away = await canned(supabase, turn.tenantId, 'away', vars);
    if (away) replies.push({ type: 'text', body: away });
  }

  // First contact in a while gets a greeting plus the menu. Without this the
  // seeded 'greeting' reply was dead config, and a plain "hola" — the single
  // most common opening message — fell through to the "didn't understand"
  // fallback, which reads as a broken bot.
  const isFirstTurn =
    !conv.active_goal_id &&
    (await isNewConversation(supabase, conv.id, settings.greet_cooldown_seconds ?? 21600));

  // Mid-flow: keep filling the same goal rather than re-matching intent.
  const active = conv.active_goal_id ? goals.find((g) => g.id === conv.active_goal_id) : null;
  const matched = active ? { goal: active, score: 100 } : matchGoal(goals, turn.text, turn.replyId);

  if (!matched) {
    if (isFirstTurn) {
      const greeting = await canned(supabase, turn.tenantId, 'greeting', vars);
      replies.push({
        type: 'interactive',
        body: greeting || renderTemplate('¡Hola! ¿En qué te puedo ayudar?', vars),
        buttons: buildMenu(goals).slice(0, 3),
      });
      await say(conv.id, replies);
      return;
    }

    if (settings.ai_enabled) {
      const handled = await runAi({ ctx, text: turn.text, vars, goals });
      if (handled) return;
    }
    // Never guess. Offer the menu, which always works.
    const fallback = await canned(supabase, turn.tenantId, 'fallback', vars);
    replies.push({
      type: 'interactive',
      body: fallback || renderTemplate('¿En qué te puedo ayudar?', vars),
      buttons: buildMenu(goals).slice(0, 3),
    });
    await say(conv.id, replies);
    return;
  }

  const goal = matched.goal as (typeof goals)[number];

  if (goal.resolver === 'reply' && goal.reply_body) {
    replies.push({ type: 'text', body: renderTemplate(goal.reply_body, vars) });
    await supabase.from('whatsapp_conversations').update({ active_goal_id: null, state: {} }).eq('id', conv.id);
    await say(conv.id, replies);
    return;
  }

  if (goal.resolver === 'flow' && goal.flow) {
    const state = (active ? (conv.state as unknown as FlowState) : null) ?? { values: {} };

    // With AI on, the model runs the booking instead of the scripted questions.
    //
    // The script is still what defines WHAT has to be collected — the
    // restaurant wrote it — but the model decides how to ask, can clarify an
    // ambiguous answer ("el 30" of which month?), and can take a detour to
    // answer something else without losing its place. The rigid step() below
    // stays as the fallback for every way this can fail: no key, budget spent,
    // provider down, timeout.
    if (settings.ai_enabled) {
      const needed = goal.flow.slots
        .filter((slot) => slot.required !== false && state.values[slot.key] === undefined)
        .map((slot) => ({
          key: slot.key,
          prompt: slot.prompt,
          options: slot.options?.map((o) => o.title),
        }));

      const handled = await runAi({
        ctx,
        text: turn.text,
        vars,
        goals,
        collecting: { goalName: goal.name, needed, known: state.values },
      });

      if (handled) {
        // The model may have written new facts down through `anotar_datos`, so
        // only the goal pointer is touched here — overwriting state would undo
        // whatever it just learned.
        await supabase
          .from('whatsapp_conversations')
          .update({ active_goal_id: goal.id })
          .eq('id', conv.id);
        return;
      }
    }

    const result = step(goal.flow, state, { text: turn.text, replyId: turn.replyId }, {
      parse: (slot: Slot, raw: string) =>
        slot.type === 'date' ? parseSpanishDate(raw, ctx.today)
        : slot.type === 'time' ? parseSpanishTime(raw)
        : slot.key === 'party_size' ? parsePartySize(raw)
        : null,
    });

    replies.push(...result.replies);

    if (result.action?.kind === 'create_reservation') {
      const v = result.action.values;
      const outcome = await botCreateReservation(ctx, {
        customer_name: String(v.customer_name ?? contact.profile_name ?? 'Cliente'),
        party_size: Number(v.party_size ?? 2),
        date: String(v.date ?? ctx.today),
        time: String(v.time ?? '20:00'),
        area: v.area ? String(v.area) : undefined,
      });
      replies.push({
        type: 'text',
        body: outcome.ok
          ? renderTemplate(await canned(supabase, turn.tenantId, 'reservation_ok', vars) ||
              'Tu solicitud quedó registrada. Te confirmamos en unos minutos.', vars)
          : reservationErrorMessage(String(outcome.data?.error ?? 'failed')),
      });
    }

    await supabase
      .from('whatsapp_conversations')
      .update({
        active_goal_id: result.done ? null : goal.id,
        state: result.done ? {} : (result.state as unknown as Record<string, unknown>),
      })
      .eq('id', conv.id);

    await say(conv.id, replies);
    return;
  }

  if (settings.ai_enabled) {
    const handled = await runAi({ ctx, text: turn.text, vars, goals });
    if (handled) return;
  }
  await say(conv.id, replies);
}

/** Turn a refusal code from the booking RPC into something a diner can act on. */
function reservationErrorMessage(code: string): string {
  switch (code) {
    case 'slot_full': return 'Ya no tenemos lugar a esa hora. ¿Probamos con otro horario?';
    case 'too_soon': return 'Esa hora está muy próxima para reservar. ¿Buscamos otro momento?';
    case 'too_far': return 'Esa fecha está demasiado lejos para reservar todavía.';
    case 'party_out_of_range': return 'Para ese número de personas, mejor te contactamos directamente.';
    case 'not_enabled': return 'Por ahora no estamos tomando reservaciones en línea.';
    default: return 'No pude registrar la reservación. Un momento y te atiende una persona.';
  }
}

async function say(conversationId: string, drafts: OutboundDraft[]): Promise<void> {
  // Two messages max, so the bot never floods a chat.
  for (const draft of drafts.slice(0, 2)) {
    try {
      await sendMessage(conversationId, draft, 'bot');
    } catch {
      // A closed window or a failed send is already recorded by sendMessage.
      return;
    }
  }
}

async function canned(
  supabase: ReturnType<typeof createAdminClient>,
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

async function buildContext(
  supabase: ReturnType<typeof createAdminClient>,
  conv: { id: string; tenant_id: string; branch_id: string | null },
  waId: string,
  profileName: string | null,
): Promise<BotContext> {
  const { data } = await supabase
    .from('tenants')
    .select('timezone')
    .eq('id', conv.tenant_id)
    .maybeSingle();
  return {
    tenantId: conv.tenant_id,
    branchId: conv.branch_id,
    conversationId: conv.id,
    waId,
    today: todayInTz((data as { timezone: string } | null)?.timezone),
    customerName: profileName,
  };
}

/** The facts a canned reply or prompt can interpolate. */
async function buildVars(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  branchId: string | null,
): Promise<{ vars: RenderVars; open: boolean }> {
  const [{ data: tenant }, { data: contact }] = await Promise.all([
    supabase.from('tenants').select('name, subdomain, custom_domain, timezone').eq('id', tenantId).maybeSingle(),
    supabase.from('tenant_contact').select('address, maps_url, hours, whatsapp_phone').eq('tenant_id', tenantId).maybeSingle(),
  ]);

  const t = tenant as { name: string; subdomain: string; custom_domain: string | null; timezone: string } | null;
  const c = contact as { address: string | null; maps_url: string | null; hours: unknown; whatsapp_phone: string | null } | null;

  const week = parseWeekHours(c?.hours);
  const tz = t?.timezone;
  const today = week ? todayHoursIn(week, tz) : null;
  const open = week ? isOpenNowIn(week, tz) : true;

  void branchId; // branch-specific hours are a later refinement

  return {
    open,
    vars: {
    restaurante: t?.name ?? '',
    horario_hoy: today
      ? today.closed ? 'hoy cerrado' : `${today.open} a ${today.close}`
      : '',
    horario_semana: week
      ? week.map((d, i) =>
          `${['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][i]}: ${d.closed ? 'cerrado' : `${d.open}-${d.close}`}`,
        ).join('\n')
      : '',
    direccion: c?.address ?? '',
    mapa: mapHref(c?.maps_url ?? null, c?.address ?? null) ?? '',
    menu_url: t ? tenantBaseUrl(t.subdomain, t.custom_domain) : '',
    telefono: c?.whatsapp_phone ?? '',
    },
  };
}

/**
 * Whether this conversation has been quiet long enough to greet again.
 *
 * Greeting on every message would be unbearable; greeting only once ever would
 * leave someone who comes back next month with no orientation. The cooldown is
 * per tenant and defaults to six hours.
 */
async function isNewConversation(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  cooldownSeconds: number,
): Promise<boolean> {
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .eq('direction', 'outbound')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const last = (data as { created_at: string } | null)?.created_at;
  if (!last) return true; // never said anything here before
  return Date.now() - new Date(last).getTime() > cooldownSeconds * 1000;
}
