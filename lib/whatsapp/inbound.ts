import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeWaId } from '@/lib/phone';
import { windowExpiryFrom } from './window';
import { runBot } from './bot';

/**
 * Turns raw webhook payloads into conversations, messages and bot replies.
 *
 * Called from `after()` on the webhook and from the maintenance cron for
 * anything that got stuck, so it must be safe to run twice on the same row.
 * Idempotency hangs entirely on `whatsapp_messages.wa_message_id` being
 * globally unique: an insert that touches zero rows means Meta retried, and
 * everything downstream is skipped.
 */

type Supabase = ReturnType<typeof createAdminClient>;

interface EventRow {
  id: string;
  tenant_id: string | null;
  phone_number_id: string | null;
  field: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

export async function processEvents(ids: string[]): Promise<void> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('whatsapp_events')
    .select('id, tenant_id, phone_number_id, field, payload, attempts')
    .in('id', ids)
    .eq('status', 'pending');

  for (const row of (data ?? []) as EventRow[]) {
    try {
      await handleEvent(supabase, row);
      await supabase
        .from('whatsapp_events')
        .update({ status: 'done', processed_at: new Date().toISOString(), attempts: row.attempts + 1 })
        .eq('id', row.id);
    } catch (err) {
      await supabase
        .from('whatsapp_events')
        .update({
          status: 'error',
          error: String(err).slice(0, 500),
          attempts: row.attempts + 1,
        })
        .eq('id', row.id);
    }
  }
}

async function handleEvent(supabase: Supabase, row: EventRow): Promise<void> {
  if (!row.tenant_id || !row.phone_number_id) return;
  const value = row.payload as Record<string, unknown>;

  switch (row.field) {
    case 'messages':
      if (Array.isArray(value.messages)) return handleInbound(supabase, row);
      if (Array.isArray(value.statuses)) return handleStatuses(supabase, value.statuses as Status[]);
      return;

    case 'smb_message_echoes':
      return handleEcho(supabase, row);

    case 'message_template_status_update':
      return handleTemplateStatus(supabase, row.tenant_id, value);

    case 'account_update':
    case 'phone_number_quality_update':
      return handleNumberUpdate(supabase, row.phone_number_id, value);

    default:
      return;
  }
}

// ── Contacts and conversations ─────────────────────────────────────────────

async function upsertConversation(
  supabase: Supabase,
  tenantId: string,
  phoneNumberId: string,
  waId: string,
  profileName: string | null,
  transport: 'cloud' | 'bridge' = 'cloud',
  /** The real number, when WhatsApp disclosed one. */
  phone: string | null = null,
): Promise<{ conversationId: string; contactId: string }> {
  const { data: contact } = await supabase
    .from('whatsapp_contacts')
    .upsert(
      {
        tenant_id: tenantId,
        wa_id: waId,
        // Canonical form, ONLY when there is a real number to canonicalise.
        // WhatsApp increasingly addresses chats by LID — an opaque id that is
        // not a phone number at all — and running that through normalizeWaId
        // would mint a plausible-looking fake like "+42507928911917" and
        // silently poison every "which reservation is this caller?" lookup.
        phone_e164: phone ? normalizeWaId(phone) : lidPlaceholder(waId),
        profile_name: profileName,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,wa_id' },
    )
    .select('id')
    .single();

  const contactId = (contact as { id: string }).id;

  const { data: conv } = await supabase
    .from('whatsapp_conversations')
    .upsert(
      { tenant_id: tenantId, phone_number_id: phoneNumberId, contact_id: contactId, transport },
      { onConflict: 'phone_number_id,contact_id' },
    )
    .select('id')
    .single();

  return { conversationId: (conv as { id: string }).id, contactId };
}

// ── Inbound customer messages ──────────────────────────────────────────────

/**
 * A stable, obviously-not-a-phone value for a contact WhatsApp will not
 * identify. Kept non-null so the column stays NOT NULL and unique per contact,
 * while never matching a real number.
 */
function lidPlaceholder(waId: string): string {
  return `lid:${waId.split('@')[0]}`;
}

interface InboundMessage {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
}

async function handleInbound(supabase: Supabase, row: EventRow): Promise<void> {
  const value = row.payload as {
    messages?: InboundMessage[];
    contacts?: { wa_id?: string; phone?: string | null; profile?: { name?: string } }[];
  };
  const tenantId = row.tenant_id!;
  const phoneNumberId = row.phone_number_id!;

  // A linked-device message arrives re-shaped by the bridge webhook; the tag
  // is what tells the send layer there is no 24-hour window to respect.
  const transport = (row.payload as { _transport?: string })._transport === 'bridge'
    ? 'bridge' as const
    : 'cloud' as const;

  for (const msg of value.messages ?? []) {
    const profile = value.contacts?.find((c) => c.wa_id === msg.from);
    const { conversationId } = await upsertConversation(
      supabase, tenantId, phoneNumberId, msg.from, profile?.profile?.name ?? null,
      transport, profile?.phone ?? null,
    );

    const body =
      msg.text?.body ??
      msg.interactive?.button_reply?.title ??
      msg.interactive?.list_reply?.title ??
      '';
    // Reply ids come back verbatim, which is how the flow engine avoids having
    // to parse Spanish free text at all.
    const replyId =
      msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id ?? null;

    const { data: inserted } = await supabase
      .from('whatsapp_messages')
      .upsert(
        {
          tenant_id: tenantId,
          conversation_id: conversationId,
          wa_message_id: msg.id,
          direction: 'inbound',
          origin: 'customer',
          type: msg.type,
          body,
          payload: msg as unknown as Record<string, unknown>,
        },
        { onConflict: 'wa_message_id', ignoreDuplicates: true },
      )
      .select('id');

    // Zero rows means we have seen this wamid before — a Meta retry. Everything
    // below (window reset, bot reply) must not happen twice.
    if (!inserted || inserted.length === 0) continue;

    const now = new Date();
    await supabase
      .from('whatsapp_conversations')
      .update({
        // ONLY a customer message opens the 24-hour window.
        window_expires_at: windowExpiryFrom(now),
        last_inbound_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', conversationId);

    await supabase
      .from('whatsapp_numbers')
      .update({ last_inbound_at: now.toISOString() })
      .eq('phone_number_id', phoneNumberId);

    await runBot({ tenantId, conversationId, text: body, replyId });
  }
}

// ── Echoes: the owner replying from their own phone ────────────────────────

/**
 * The single most important behaviour in the whole subsystem.
 *
 * Under Coexistence the restaurant keeps using WhatsApp on their phone. When
 * they answer a diner themselves, Meta tells us via `smb_message_echoes`, and
 * the bot has to fall silent for that conversation — otherwise it talks over
 * the owner in front of a customer.
 *
 * Note it does NOT extend the 24-hour window: a business talking does not give
 * itself permission to keep talking.
 */
async function handleEcho(supabase: Supabase, row: EventRow): Promise<void> {
  const value = row.payload as {
    message_echoes?: (InboundMessage & { to?: string })[];
  };
  const tenantId = row.tenant_id!;
  const phoneNumberId = row.phone_number_id!;

  for (const msg of value.message_echoes ?? []) {
    const waId = msg.to ?? msg.from;
    if (!waId) continue;

    const { conversationId } = await upsertConversation(
      supabase, tenantId, phoneNumberId, waId, null,
    );

    const { data: inserted } = await supabase
      .from('whatsapp_messages')
      .upsert(
        {
          tenant_id: tenantId,
          conversation_id: conversationId,
          wa_message_id: msg.id,
          direction: 'outbound',
          origin: 'staff_device',
          type: msg.type,
          body: msg.text?.body ?? '',
          payload: msg as unknown as Record<string, unknown>,
          status: 'sent',
          sent_at: new Date().toISOString(),
        },
        { onConflict: 'wa_message_id', ignoreDuplicates: true },
      )
      .select('id');

    if (!inserted || inserted.length === 0) continue;

    await supabase
      .from('whatsapp_conversations')
      .update({
        handoff_at: new Date().toISOString(),
        handoff_by: 'echo',
        bot_enabled: false,
        last_outbound_at: new Date().toISOString(),
      })
      .eq('id', conversationId);
  }
}

// ── Delivery receipts ──────────────────────────────────────────────────────

interface Status {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errors?: { code?: number; title?: string }[];
}

// Receipts can arrive out of order, so only ever advance.
const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4 };

async function handleStatuses(supabase: Supabase, statuses: Status[]): Promise<void> {
  for (const s of statuses) {
    const { data } = await supabase
      .from('whatsapp_messages')
      .select('id, status')
      .eq('wa_message_id', s.id)
      .maybeSingle();
    if (!data) continue;

    const current = (data as { status: string | null }).status ?? 'queued';
    if ((RANK[s.status] ?? 0) <= (RANK[current] ?? 0)) continue;

    const now = new Date().toISOString();
    await supabase
      .from('whatsapp_messages')
      .update({
        status: s.status,
        ...(s.status === 'delivered' ? { delivered_at: now } : {}),
        ...(s.status === 'read' ? { read_at: now } : {}),
        ...(s.status === 'failed'
          ? {
              failed_at: now,
              error_code: s.errors?.[0]?.code ? String(s.errors[0].code) : null,
              error_message: s.errors?.[0]?.title ?? null,
            }
          : {}),
      })
      .eq('id', (data as { id: string }).id);
  }
}

// ── Account-level updates ──────────────────────────────────────────────────

async function handleTemplateStatus(
  supabase: Supabase,
  tenantId: string,
  value: Record<string, unknown>,
): Promise<void> {
  const name = value.message_template_name as string | undefined;
  const language = value.message_template_language as string | undefined;
  const event = value.event as string | undefined;
  if (!name || !event) return;

  const status =
    event === 'APPROVED' ? 'approved'
    : event === 'REJECTED' ? 'rejected'
    : event === 'PAUSED' ? 'paused'
    : event === 'DISABLED' ? 'disabled'
    : 'pending';

  await supabase
    .from('whatsapp_templates')
    .update({
      status,
      rejected_reason: (value.reason as string | undefined) ?? null,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('name', name)
    .eq('language', language ?? 'es_MX');
}

async function handleNumberUpdate(
  supabase: Supabase,
  phoneNumberId: string,
  value: Record<string, unknown>,
): Promise<void> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof value.current_limit === 'string') patch.messaging_limit_tier = value.current_limit;
  if (typeof value.event === 'string') {
    const event = value.event;
    if (event === 'ACCOUNT_RESTRICTION' || event === 'ACCOUNT_VIOLATION') patch.status = 'banned';
    if (event === 'PHONE_NUMBER_REMOVED') patch.status = 'disconnected';
  }
  const quality = (value.current_quality_rating ?? value.event) as string | undefined;
  if (quality && ['GREEN', 'YELLOW', 'RED'].includes(quality)) patch.quality_rating = quality;

  await supabase.from('whatsapp_numbers').update(patch).eq('phone_number_id', phoneNumberId);
}
