import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getToken } from './credentials';
import { graphPost, GraphApiError } from './client';
import { sendViaBridge } from './bridge';
import { isWindowOpen, WindowClosedError } from './window';
import type { MessageOrigin, OutboundDraft } from './types';

/**
 * Everything Kuik sends to a diner goes through here.
 *
 * The order of operations matters: the row is written BEFORE the API call, so
 * a crash mid-send leaves evidence rather than a silent gap.
 */

export interface SendResult {
  ok: boolean;
  waMessageId?: string;
  error?: string;
  code?: number;
}

interface ConversationRow {
  id: string;
  tenant_id: string;
  phone_number_id: string;
  window_expires_at: string | null;
  /** 'bridge' = a linked device; 'cloud' = Meta's API. */
  transport: 'cloud' | 'bridge';
  contact: { wa_id: string; is_blocked: boolean; opted_out: boolean } | null;
}

/**
 * Meta caps a Coexistence number at 20 messages/second. An in-process bucket is
 * correct for a single Render web instance; if this ever scales past one, move
 * the counter into the `rate_limits` table or the cap is silently exceeded.
 */
const buckets = new Map<string, { tokens: number; last: number }>();
const RATE = 20;

async function takeToken(phoneNumberId: string): Promise<void> {
  const now = Date.now();
  const b = buckets.get(phoneNumberId) ?? { tokens: RATE, last: now };
  const refill = ((now - b.last) / 1000) * RATE;
  b.tokens = Math.min(RATE, b.tokens + refill);
  b.last = now;
  if (b.tokens < 1) {
    const waitMs = ((1 - b.tokens) / RATE) * 1000;
    await new Promise((r) => setTimeout(r, waitMs));
    b.tokens = 1;
  }
  b.tokens -= 1;
  buckets.set(phoneNumberId, b);
}

async function loadConversation(conversationId: string): Promise<ConversationRow | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('whatsapp_conversations')
    .select('id, tenant_id, phone_number_id, window_expires_at, transport, contact:whatsapp_contacts(wa_id, is_blocked, opted_out)')
    .eq('id', conversationId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as ConversationRow & { contact: ConversationRow['contact'] | ConversationRow['contact'][] };
  return { ...row, contact: Array.isArray(row.contact) ? row.contact[0] : row.contact };
}

function draftToApi(draft: OutboundDraft, to: string): Record<string, unknown> {
  if (draft.type === 'interactive' && draft.buttons?.length) {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: { text: draft.body },
        // WhatsApp allows at most 3 reply buttons.
        action: {
          buttons: draft.buttons.slice(0, 3).map((b) => ({
            type: 'reply',
            reply: { id: b.id, title: b.title.slice(0, 20) },
          })),
        },
      },
    };
  }
  if (draft.type === 'interactive' && draft.list) {
    return {
      messaging_product: 'whatsapp',
      to,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: { text: draft.body },
        action: {
          button: draft.list.button.slice(0, 20),
          // At most 10 sections, 10 rows each.
          sections: draft.list.sections.slice(0, 10).map((s) => ({
            title: s.title?.slice(0, 24),
            rows: s.rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: r.title.slice(0, 24),
              description: r.description?.slice(0, 72),
            })),
          })),
        },
      },
    };
  }
  return {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body: draft.body.slice(0, 4096), preview_url: false },
  };
}

/**
 * Send a free-form message. Refuses when the 24-hour window has closed — use
 * sendTemplate() there, which is the only thing Meta will deliver.
 */
export async function sendMessage(
  conversationId: string,
  draft: OutboundDraft,
  origin: MessageOrigin = 'bot',
): Promise<SendResult> {
  const conv = await loadConversation(conversationId);
  if (!conv || !conv.contact) return { ok: false, error: 'unknown_conversation' };
  if (conv.contact.is_blocked || conv.contact.opted_out) return { ok: false, error: 'opted_out' };

  // The 24-hour window is a Cloud API rule. A linked device is the restaurant's
  // own WhatsApp account sending a message, so there is no window and no
  // template requirement — which is why reminders can go out automatically on
  // this transport and cannot on the other.
  if (conv.transport !== 'bridge' && !isWindowOpen(conv)) throw new WindowClosedError();

  const supabase = createAdminClient();

  if (conv.transport === 'bridge') {
    return sendThroughBridge(supabase, conv, draft, origin);
  }

  const token = await getToken(conv.phone_number_id);
  if (!token) return { ok: false, error: 'no_credentials' };

  // Persist first: a process killed mid-send still leaves a trace.
  const { data: pending } = await supabase
    .from('whatsapp_messages')
    .insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      direction: 'outbound',
      origin,
      type: draft.type,
      body: draft.body,
      status: 'queued',
    })
    .select('id')
    .single();

  const rowId = (pending as { id: string } | null)?.id;

  await takeToken(conv.phone_number_id);

  try {
    const res = await graphPost<{ messages?: { id: string }[] }>(
      `${conv.phone_number_id}/messages`,
      token,
      draftToApi(draft, conv.contact.wa_id),
    );
    const waMessageId = res.messages?.[0]?.id;

    if (rowId) {
      await supabase
        .from('whatsapp_messages')
        .update({ wa_message_id: waMessageId, status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', rowId);
    }
    await supabase
      .from('whatsapp_conversations')
      .update({ last_outbound_at: new Date().toISOString() })
      .eq('id', conv.id);

    return { ok: true, waMessageId };
  } catch (err) {
    const graph = err instanceof GraphApiError ? err : null;
    const code = graph?.code;

    // 131047: Meta says the window is shut. Our copy was stale — correct it so
    // the next attempt reaches for a template instead of retrying free-form.
    if (code === 131047) {
      await supabase
        .from('whatsapp_conversations')
        .update({ window_expires_at: null })
        .eq('id', conv.id);
    }

    if (rowId) {
      await supabase
        .from('whatsapp_messages')
        .update({
          status: 'failed',
          error_code: code ? String(code) : null,
          error_message: graph?.message ?? String(err),
          failed_at: new Date().toISOString(),
        })
        .eq('id', rowId);
    }
    return { ok: false, error: graph?.message ?? 'send_failed', code };
  }
}

/**
 * Send an approved template. The only thing that works outside the window, and
 * the only thing Meta bills for.
 */
export async function sendTemplate(
  conversationId: string,
  name: string,
  language: string,
  vars: Record<string, string>,
): Promise<SendResult> {
  const conv = await loadConversation(conversationId);
  if (!conv || !conv.contact) return { ok: false, error: 'unknown_conversation' };
  if (conv.contact.is_blocked || conv.contact.opted_out) return { ok: false, error: 'opted_out' };

  const supabase = createAdminClient();

  const { data: tpl } = await supabase
    .from('whatsapp_templates')
    .select('name, language, status, variables')
    .eq('tenant_id', conv.tenant_id)
    .eq('name', name)
    .eq('language', language)
    .maybeSingle();

  // Sending an unapproved name earns a 400 AND damages the number's quality
  // rating, which is the one asset that cannot be bought back.
  if (!tpl || (tpl as { status: string }).status !== 'approved') {
    return { ok: false, error: 'template_not_approved' };
  }

  const mapping = ((tpl as { variables: { index: number; key: string }[] }).variables ?? [])
    .slice()
    .sort((a, b) => a.index - b.index);

  const token = await getToken(conv.phone_number_id);
  if (!token) return { ok: false, error: 'no_credentials' };

  const { data: pending } = await supabase
    .from('whatsapp_messages')
    .insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      direction: 'outbound',
      origin: 'system',
      type: 'template',
      template_name: name,
      template_lang: language,
      template_vars: vars,
      status: 'queued',
    })
    .select('id')
    .single();
  const rowId = (pending as { id: string } | null)?.id;

  await takeToken(conv.phone_number_id);

  try {
    const res = await graphPost<{ messages?: { id: string }[] }>(
      `${conv.phone_number_id}/messages`,
      token,
      {
        messaging_product: 'whatsapp',
        to: conv.contact.wa_id,
        type: 'template',
        template: {
          name,
          language: { code: language },
          components: mapping.length
            ? [{
                type: 'body',
                // Meta wants positional parameters; the mapping is what lets
                // callers pass { nombre, fecha } and never think about {{2}}.
                parameters: mapping.map((m) => ({ type: 'text', text: vars[m.key] ?? '' })),
              }]
            : [],
        },
      },
    );
    const waMessageId = res.messages?.[0]?.id;
    if (rowId) {
      await supabase
        .from('whatsapp_messages')
        .update({ wa_message_id: waMessageId, status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', rowId);
    }
    return { ok: true, waMessageId };
  } catch (err) {
    const graph = err instanceof GraphApiError ? err : null;
    if (rowId) {
      await supabase
        .from('whatsapp_messages')
        .update({
          status: 'failed',
          error_code: graph?.code ? String(graph.code) : null,
          error_message: graph?.message ?? String(err),
          failed_at: new Date().toISOString(),
        })
        .eq('id', rowId);
    }
    return { ok: false, error: graph?.message ?? 'send_failed', code: graph?.code };
  }
}

/**
 * Send through the linked-device bridge.
 *
 * Same bookkeeping as the Cloud API path — row first, then the call — so a
 * crash mid-send leaves a trace either way. Interactive buttons degrade to
 * numbered text: a linked device cannot render WhatsApp's native button UI, and
 * silently dropping the options would leave the diner with a question and no
 * way to answer it.
 */
async function sendThroughBridge(
  supabase: ReturnType<typeof createAdminClient>,
  conv: ConversationRow,
  draft: OutboundDraft,
  origin: MessageOrigin,
): Promise<SendResult> {
  const contact = conv.contact!;
  const options = draft.buttons ?? draft.list?.sections.flatMap((s) => s.rows) ?? [];
  const text = options.length
    ? `${draft.body}\n\n${options.map((o, i) => `${i + 1}. ${o.title}`).join('\n')}`
    : draft.body;

  const { data: pending } = await supabase
    .from('whatsapp_messages')
    .insert({
      tenant_id: conv.tenant_id,
      conversation_id: conv.id,
      direction: 'outbound',
      origin,
      type: 'text',
      body: text,
      status: 'queued',
    })
    .select('id')
    .single();
  const rowId = (pending as { id: string } | null)?.id;

  try {
    const res = await sendViaBridge(conv.tenant_id, contact.wa_id, { text });
    if (rowId) {
      await supabase
        .from('whatsapp_messages')
        .update({ wa_message_id: res.id, status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', rowId);
    }
    await supabase
      .from('whatsapp_conversations')
      .update({ last_outbound_at: new Date().toISOString() })
      .eq('id', conv.id);
    return { ok: true, waMessageId: res.id };
  } catch (err) {
    if (rowId) {
      await supabase
        .from('whatsapp_messages')
        .update({
          status: 'failed',
          error_message: String(err).slice(0, 300),
          failed_at: new Date().toISOString(),
        })
        .eq('id', rowId);
    }
    return { ok: false, error: 'bridge_send_failed' };
  }
}
