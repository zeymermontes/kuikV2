import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

import { parseWeekHours, isOpenNowIn, todayHoursIn, mapHref } from '@/lib/hours';
import { todayInTz } from '@/lib/time';
import { tenantBaseUrl } from '@/lib/config';
import { rateLimit, bucketKey } from '@/lib/rate-limit';
import { canUse, effectivePlan } from '@/lib/plan';
import { buildMenu, matchesAnyKeyword } from './intent';
import { renderTemplate, type RenderVars } from './render';
import { botHandoff, type BotContext } from './actions';
import { sendMessage } from './send';
import { runFlowTurn } from './flows/runtime';
import { endRun } from './flows/run-store';
import { handleReservationReply } from './reservation-reply';
import { runAi } from '@/lib/ai/run';
import type { OutboundDraft, WhatsappFlow, WhatsappFlowRun } from './types';

/**
 * Decides what — if anything — the bot says back.
 *
 * The most important logic here is about staying quiet. Under Coexistence the
 * restaurant is using the same number from their phone, so the bot must never
 * talk over a human, never answer its own messages, and never keep going once
 * someone has taken over.
 *
 * Conversation goals are FLOWS now (whatsapp_flows, a published graph each);
 * the actual walking lives in flows/runtime.ts. This file keeps the etiquette:
 * opt-out, handoff keywords, rate caps, greeting, and the plan gate — flows
 * and AI are the Pro product, so a basic tenant's bot greets and hands off but
 * never starts a run.
 */

export interface BotTurn {
  tenantId: string;
  conversationId: string;
  text: string;
  replyId?: string | null;
  /** A voice note that couldn't be transcribed — answer that, not silence. */
  kind?: 'audio_unreadable';
}

export async function runBot(turn: BotTurn): Promise<void> {
  const supabase = createAdminClient();

  const { data: convRow } = await supabase
    .from('whatsapp_conversations')
    .select('id, tenant_id, branch_id, phone_number_id, bot_enabled, handoff_at, active_flow_run_id, reservation_id, contact:whatsapp_contacts(id, wa_id, opted_out, is_blocked, profile_name)')
    .eq('id', turn.conversationId)
    .maybeSingle();
  if (!convRow) return;

  const conv = convRow as unknown as {
    id: string; tenant_id: string; branch_id: string | null; phone_number_id: string;
    bot_enabled: boolean; handoff_at: string | null; active_flow_run_id: string | null;
    reservation_id: string | null;
    contact: { id: string; wa_id: string; opted_out: boolean; is_blocked: boolean; profile_name: string | null }
           | { id: string; wa_id: string; opted_out: boolean; is_blocked: boolean; profile_name: string | null }[];
  };
  const contact = Array.isArray(conv.contact) ? conv.contact[0] : conv.contact;
  if (!contact || contact.opted_out || contact.is_blocked) return;

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

  const resetSeconds = settings.greet_cooldown_seconds ?? 21600;

  // A human is on this conversation — usually because the owner replied from
  // their own phone. Say nothing... while the conversation is HOT. After the
  // cooldown of total silence (no diner, no bot, no staff) it counts as a NEW
  // chat: the handoff is released and the bot wakes up. Without this, one
  // "pásame con alguien" muted a conversation forever.
  if (!conv.bot_enabled || conv.handoff_at) {
    if (!(await conversationIsStale(supabase, conv.id, resetSeconds))) return;
    await supabase
      .from('whatsapp_conversations')
      .update({ bot_enabled: true, handoff_at: null, handoff_by: null })
      .eq('id', conv.id);
    conv.bot_enabled = true;
    conv.handoff_at = null;
  }

  // Opting out has to work before anything else does — deterministically,
  // AI or not. Whole-word matching: "2 personas" must never read as intent.
  if (matchesAnyKeyword(settings.optout_keywords, turn.text)) {
    await supabase
      .from('whatsapp_contacts')
      .update({ opted_out: true })
      .eq('tenant_id', turn.tenantId)
      .eq('wa_id', contact.wa_id);
    await say(conv.id, [{ type: 'text', body: await canned(supabase, turn.tenantId, 'optout_ack', {}) }]);
    return;
  }

  // A "1" or "2" answering yesterday's reservation reminder — deterministic,
  // before flows or AI, because it changes a booking's fate.
  if (await handleReservationReply(supabase, conv, turn.text)) return;

  // Caps that protect the AI bill AND the number's quality rating, which is the
  // one asset a restaurant cannot buy back once Meta downgrades it.
  const hourly = await rateLimit(bucketKey('wa:bot:h', contact.wa_id, 3600), settings.max_bot_replies_per_hour, 3600);
  const daily = await rateLimit(bucketKey('wa:bot:d', contact.wa_id, 86400), settings.max_bot_replies_per_day, 86400);
  if (!hourly.ok || !daily.ok) {
    const ctx = await buildContext(supabase, conv, contact.wa_id, contact.profile_name);
    await botHandoff(ctx, 'budget');
    await markRunHandoff(supabase, conv.active_flow_run_id);
    return;
  }

  // A voice note nobody could transcribe: say so. Ignoring an audio reads as
  // being left on seen — the one thing a paid bot must never do.
  if (turn.kind === 'audio_unreadable') {
    const fallback = await canned(supabase, turn.tenantId, 'audio_fallback', {});
    await say(conv.id, [{
      type: 'text',
      body: fallback || 'Recibí tu audio 🎧 pero por ahora no puedo escucharlo. ¿Me lo escribes? 🙏',
    }]);
    return;
  }

  // Four independent lookups; on the per-message hot path they must not run
  // serially. (The runnable graph is NOT fetched here — the runtime loads the
  // published snapshot only when a run actually starts or continues.)
  const [ctx, { vars, open }, { data: subRow }, { data: flowRows }] = await Promise.all([
    buildContext(supabase, conv, contact.wa_id, contact.profile_name),
    buildVars(supabase, turn.tenantId, conv.branch_id),
    supabase
      .from('subscriptions')
      .select('status, plan')
      .eq('tenant_id', turn.tenantId)
      .maybeSingle(),
    supabase
      .from('whatsapp_flows')
      .select('id, tenant_id, key, name, description, enabled, priority, triggers, mode, published_version, nudge_after_minutes, max_nudges, nudge_message, close_after_minutes, close_message')
      .eq('tenant_id', turn.tenantId)
      .eq('enabled', true)
      .gt('published_version', 0)
      .order('priority', { ascending: false }),
  ]);

  // The plan gate. Flows, AI turns and the inbox are what Pro pays for; a
  // basic tenant's bot still greets, hands off and honors opt-out, and a run
  // that began before a downgrade is allowed to finish.
  const botsAllowed = subRow
    ? canUse(effectivePlan(subRow as { status: 'trialing' | 'active' | 'past_due' | 'canceled'; plan: 'basic' | 'pro' }), 'wa_bots')
    : false;
  const aiAllowed = Boolean(settings.ai_enabled) && botsAllowed;

  const flows = (flowRows ?? []) as unknown as WhatsappFlow[];
  const aiGoals = flows.map((f) => ({ key: f.key, name: f.name, description: f.description }));

  // "Pásame con una persona": with AI on, the MODEL reads the whole message
  // and decides (it has the pasar_con_humano tool and the context to tell a
  // request from a mention). The deterministic shortcut only fires when no AI
  // will see the message — scripted mode has nothing to interpret with.
  const wantsHuman = matchesAnyKeyword(settings.handoff_keywords, turn.text);
  if (wantsHuman && !aiAllowed) {
    await botHandoff(ctx, 'keyword');
    await markRunHandoff(supabase, conv.active_flow_run_id);
    await say(conv.id, [{ type: 'text', body: await canned(supabase, turn.tenantId, 'handoff', {}) }]);
    return;
  }

  // Out of hours, say so — but keep going. A booking request at 2am should
  // still book; replacing the whole reply with "we're closed" is the mistake
  // that makes a bot feel broken.
  const replies: OutboundDraft[] = [];
  if (settings.away_enabled && !open) {
    const away = await canned(supabase, turn.tenantId, 'away', vars);
    if (away) replies.push({ type: 'text', body: away });
  }

  // Active run, or a flow whose triggers match: the runtime takes it from here.
  const handled = await runFlowTurn({
    supabase, conv, contactId: contact.id, botCtx: ctx, vars,
    turn: { text: turn.text, replyId: turn.replyId },
    flows, aiEnabled: aiAllowed, botsAllowed, aiGoals, wantsHuman,
    pendingReplies: replies,
  });
  if (handled) return;

  // First contact in a while gets a greeting plus the menu. Without this the
  // seeded 'greeting' reply was dead config, and a plain "hola" — the single
  // most common opening message — fell through to the "didn't understand"
  // fallback, which reads as a broken bot. (Not when they asked for a human:
  // greeting over that request reads as being ignored.)
  const isFirstTurn =
    !wantsHuman &&
    !conv.active_flow_run_id &&
    (await isNewConversation(supabase, conv.id, resetSeconds));

  // The menu buttons start flows, so a basic tenant's greeting goes without
  // them — a button that silently does nothing reads as a broken bot.
  const menuButtons = botsAllowed ? buildMenu(flows).slice(0, 3) : [];

  if (isFirstTurn) {
    const greeting = await canned(supabase, turn.tenantId, 'greeting', vars);
    const body = greeting || renderTemplate('¡Hola! ¿En qué te puedo ayudar?', vars);
    replies.push(menuButtons.length
      ? { type: 'interactive', body, buttons: menuButtons }
      : { type: 'text', body });
    await say(conv.id, replies);
    return;
  }

  if (aiAllowed) {
    const handledByAi = await runAi({ ctx, text: turn.text, vars, goals: aiGoals });
    if (handledByAi) return;
  }

  // The AI was supposed to weigh this request but failed; honor it the
  // deterministic way rather than answering with a menu.
  if (wantsHuman) {
    await botHandoff(ctx, 'keyword');
    await markRunHandoff(supabase, conv.active_flow_run_id);
    await say(conv.id, [{ type: 'text', body: await canned(supabase, turn.tenantId, 'handoff', {}) }]);
    return;
  }

  // Never guess. Offer the menu, which always works.
  const fallback = await canned(supabase, turn.tenantId, 'fallback', vars);
  const body = fallback || renderTemplate('¿En qué te puedo ayudar?', vars);
  replies.push(menuButtons.length
    ? { type: 'interactive', body, buttons: menuButtons }
    : { type: 'text', body });
  await say(conv.id, replies);
}

/** A keyword or budget handoff mid-run: the run ends as 'handoff', visibly. */
async function markRunHandoff(
  supabase: ReturnType<typeof createAdminClient>,
  activeRunId: string | null,
): Promise<void> {
  if (!activeRunId) return;
  const { data } = await supabase
    .from('whatsapp_flow_runs')
    .select('id, tenant_id, flow_id, flow_version, conversation_id')
    .eq('id', activeRunId)
    .eq('status', 'active')
    .maybeSingle();
  if (data) {
    await endRun(
      supabase,
      data as Pick<WhatsappFlowRun, 'id' | 'tenant_id' | 'flow_id' | 'flow_version' | 'conversation_id'>,
      'handoff', 'handoff_keyword',
    );
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
  const [{ data: tenant }, { data: contactRow }, { data: branchRow }] = await Promise.all([
    supabase.from('tenants').select('name, subdomain, custom_domain, timezone').eq('id', tenantId).maybeSingle(),
    supabase.from('tenant_contact').select('address, maps_url, hours, whatsapp_phone').eq('tenant_id', tenantId).maybeSingle(),
    branchId
      ? supabase.from('branches').select('address, maps_url, hours, whatsapp_phone').eq('id', branchId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const t = tenant as { name: string; subdomain: string; custom_domain: string | null; timezone: string } | null;
  type ContactShape = { address: string | null; maps_url: string | null; hours: unknown; whatsapp_phone: string | null };
  const main = contactRow as ContactShape | null;
  const branch = branchRow as ContactShape | null;

  // A number tied to a branch answers with THAT branch's facts, falling back
  // per field — same override rule the public menu uses (MenuScreen.tsx).
  const c: ContactShape | null = branch
    ? {
        address: branch.address ?? main?.address ?? null,
        maps_url: branch.maps_url ?? main?.maps_url ?? null,
        hours: branch.hours ?? main?.hours ?? null,
        whatsapp_phone: branch.whatsapp_phone ?? main?.whatsapp_phone ?? null,
      }
    : main;

  const week = parseWeekHours(c?.hours);
  const tz = t?.timezone;
  const today = week ? todayHoursIn(week, tz) : null;
  const open = week ? isOpenNowIn(week, tz) : true;

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
 * Whether the conversation went completely silent long enough to count as a
 * NEW chat — no messages from anyone (diner, bot, AI, staff), so a lingering
 * handoff no longer means a human is actually attending.
 *
 * The just-arrived inbound is excluded by a small grace window: it was
 * persisted right before runBot and would otherwise make every conversation
 * look active.
 */
async function conversationIsStale(
  supabase: ReturnType<typeof createAdminClient>,
  conversationId: string,
  resetSeconds: number,
): Promise<boolean> {
  const { data } = await supabase
    .from('whatsapp_messages')
    .select('created_at')
    .eq('conversation_id', conversationId)
    .lt('created_at', new Date(Date.now() - 20_000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const last = (data as { created_at: string } | null)?.created_at;
  if (!last) return true;
  return Date.now() - new Date(last).getTime() > resetSeconds * 1000;
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
