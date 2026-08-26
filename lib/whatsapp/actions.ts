import 'server-only';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createReservation } from '@/lib/reservations/create';
import { normalizeWaId } from '@/lib/phone';

/**
 * What a conversation can actually DO.
 *
 * These are the same functions the flow engine calls on confirmation and the
 * AI calls as tools — one Zod schema, one implementation, one set of rules.
 * That shared terminus is what makes "the bot works with AI switched off" true
 * rather than a claim: turning AI on changes who decides to call them, not what
 * they do.
 */

export interface BotContext {
  tenantId: string;
  branchId: string | null;
  conversationId: string;
  waId: string;
  /** The restaurant's today, "YYYY-MM-DD". */
  today: string;
  customerName?: string | null;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  data?: Record<string, unknown>;
}

export const CreateReservationInput = z.object({
  customer_name: z.string().min(2).max(80),
  party_size: z.number().int().min(1).max(50),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  area: z.string().optional(),
  note: z.string().max(300).optional(),
});
export type CreateReservationArgs = z.infer<typeof CreateReservationInput>;

/**
 * Book a table from a chat.
 *
 * Goes through lib/reservations/create.ts like every other writer, using the
 * SERVICE-ROLE client — which the RPC reads as "the public", so a bot booking
 * is held to exactly the rules a diner filling in the web form would be:
 * reservations must be switched on, the slot must have room, the time must be
 * far enough ahead. The bot gets no privileges of its own.
 */
export async function botCreateReservation(
  ctx: BotContext,
  args: CreateReservationArgs,
): Promise<ActionResult> {
  const supabase = createAdminClient();

  let areaId: string | null = null;
  if (args.area) {
    const { data } = await supabase
      .from('reservation_areas')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .ilike('name', args.area)
      .maybeSingle();
    areaId = (data as { id: string } | null)?.id ?? null;
  }

  const phone = normalizeWaId(ctx.waId);

  const result = await createReservation(supabase, {
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    areaId,
    customerName: args.customer_name,
    phone,
    partySize: args.party_size,
    date: args.date,
    time: args.time,
    note: args.note ?? null,
    source: 'bot',
  });

  if (!result.ok) {
    // Hand back the code; the caller turns it into words the diner reads.
    return { ok: false, message: result.error, data: { error: result.error } };
  }

  // Tie the booking to the chat both ways, so a follow-up message lands in
  // context and the board can show where it came from.
  await supabase
    .from('reservations')
    .update({ whatsapp_conversation_id: ctx.conversationId, phone_e164: phone })
    .eq('id', result.id);
  await supabase
    .from('whatsapp_conversations')
    .update({ reservation_id: result.id })
    .eq('id', ctx.conversationId);

  return { ok: true, message: 'created', data: { id: result.id } };
}

/** Stop replying and let a person take over. */
export async function botHandoff(ctx: BotContext, reason?: string): Promise<ActionResult> {
  const supabase = createAdminClient();
  await supabase
    .from('whatsapp_conversations')
    .update({
      bot_enabled: false,
      handoff_at: new Date().toISOString(),
      handoff_by: reason ?? 'keyword',
    })
    .eq('id', ctx.conversationId);
  return { ok: true, message: 'handoff' };
}
