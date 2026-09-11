import 'server-only';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createReservation } from '@/lib/reservations/create';
import { normalizeWaId } from '@/lib/phone';
import { sendToTenant } from '@/lib/push/send';

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
  /** Set while an AI turn is driving a flow run — lets tools close that run. */
  flowRunId?: string;
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

  // A handoff without a notification is a diner waiting for a human who
  // doesn't know they exist. Best-effort: the handoff stands even if no one
  // has push subscriptions.
  await sendToTenant(ctx.tenantId, ['owner', 'manager'], (locale) =>
    locale === 'en'
      ? {
          title: 'A customer is waiting on WhatsApp',
          body: `${ctx.customerName || 'A customer'} asked for a person. The bot stepped aside.`,
          tag: `wa-handoff-${ctx.conversationId}`,
          url: `/whatsapp/inbox?c=${ctx.conversationId}`,
        }
      : {
          title: 'Un cliente espera en WhatsApp',
          body: `${ctx.customerName || 'Un cliente'} pidió hablar con una persona. El bot se hizo a un lado.`,
          tag: `wa-handoff-${ctx.conversationId}`,
          url: `/whatsapp/inbox?c=${ctx.conversationId}`,
        },
  ).catch(() => {});

  return { ok: true, message: 'handoff' };
}

/* ───────────────────────────── existing bookings ───────────────────────── */

export interface OwnReservation {
  id: string;
  customer_name: string;
  party_size: number;
  date: string;
  time: string;
  status: string;
  starts_at: string | null;
  note: string | null;
  area_id: string | null;
}

/**
 * The live, upcoming bookings behind this chat: the ones the bot made here,
 * plus any made under the same phone (web form, staff). This is the ONLY
 * set the chat may read, change or cancel — a reservation id the model
 * invents for someone else's table never passes.
 */
export async function ownReservations(ctx: Pick<BotContext, 'tenantId' | 'conversationId' | 'waId'>): Promise<OwnReservation[]> {
  const supabase = createAdminClient();
  const phone = normalizeWaId(ctx.waId);
  const { data } = await supabase
    .from('reservations')
    .select('id, customer_name, party_size, date, time, status, starts_at, note, area_id, whatsapp_conversation_id, phone_e164, phone')
    .eq('tenant_id', ctx.tenantId)
    .in('status', ['pending', 'confirmed', 'waiting', 'notified'])
    .gte('starts_at', new Date(Date.now() - 2 * 3_600_000).toISOString())
    .or(`whatsapp_conversation_id.eq.${ctx.conversationId},phone_e164.eq.${phone},phone.eq.${phone}`)
    .order('starts_at', { ascending: true })
    .limit(3);
  return ((data ?? []) as OwnReservation[]).map(({ id, customer_name, party_size, date, time, status, starts_at, note, area_id }) => ({
    id, customer_name, party_size, date, time, status, starts_at, note, area_id,
  }));
}

const DAY_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

/** "sáb 2026-09-12 a las 20:00, 4 personas, a nombre de Ana — pendiente de confirmar". */
export function describeReservation(r: OwnReservation): string {
  const wd = DAY_SHORT[(new Date(`${r.date}T12:00:00Z`).getUTCDay() + 6) % 7];
  const status =
    r.status === 'confirmed' ? 'CONFIRMADA por el restaurante'
    : r.status === 'pending' ? 'PENDIENTE de confirmar por el restaurante'
    : r.status;
  return `${wd} ${r.date} a las ${r.time.slice(0, 5)}, ${r.party_size} persona${r.party_size === 1 ? '' : 's'}, a nombre de ${r.customer_name} — ${status}`;
}

async function notifyFloor(tenantId: string, title: { es: string; en: string }, body: { es: string; en: string }, tag: string): Promise<void> {
  await sendToTenant(tenantId, ['owner', 'manager', 'host'], (locale) =>
    locale === 'en'
      ? { title: title.en, body: body.en, tag, url: '/reservations' }
      : { title: title.es, body: body.es, tag, url: '/reservations' },
  ).catch(() => {});
}

/** Cancel one of the chat's own bookings. */
export async function botCancelReservation(ctx: BotContext, reservationId: string): Promise<ActionResult> {
  const mine = await ownReservations(ctx);
  const r = mine.find((x) => x.id === reservationId);
  if (!r) return { ok: false, message: 'not_found' };

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', r.id)
    .eq('tenant_id', ctx.tenantId)
    .in('status', ['pending', 'confirmed', 'waiting', 'notified'])
    .select('id');
  if (!data || data.length === 0) return { ok: false, message: 'not_found' };

  await notifyFloor(
    ctx.tenantId,
    { es: 'Reservación cancelada por el cliente', en: 'Reservation canceled by the guest' },
    {
      es: `${r.customer_name} canceló: ${r.date} ${r.time.slice(0, 5)}, ${r.party_size} personas.`,
      en: `${r.customer_name} canceled: ${r.date} ${r.time.slice(0, 5)}, ${r.party_size} people.`,
    },
    `res-cancel-${r.id}`,
  );
  return { ok: true, message: 'cancelled', data: { reservation: r } };
}

export const UpdateReservationInput = z.object({
  reservation_id: z.string().uuid(),
  party_size: z.number().int().min(1).max(50).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  customer_name: z.string().min(2).max(80).optional(),
});
export type UpdateReservationArgs = z.infer<typeof UpdateReservationInput>;

/**
 * Change a booking's date, time, party or name. Done as a NEW request through
 * the same RPC (so capacity, lead time and the booking window are checked
 * again) and, once that lands, the old one is released — a moved table goes
 * back to "pending" for the restaurant to confirm, which is the honest state.
 */
export async function botUpdateReservation(ctx: BotContext, args: UpdateReservationArgs): Promise<ActionResult> {
  const mine = await ownReservations(ctx);
  const old = mine.find((x) => x.id === args.reservation_id);
  if (!old) return { ok: false, message: 'not_found' };
  if (args.party_size === undefined && !args.date && !args.time && !args.customer_name) {
    return { ok: false, message: 'nothing_to_change' };
  }

  const supabase = createAdminClient();
  const phone = normalizeWaId(ctx.waId);
  const result = await createReservation(supabase, {
    tenantId: ctx.tenantId,
    branchId: ctx.branchId,
    areaId: old.area_id,
    customerName: args.customer_name ?? old.customer_name,
    phone,
    partySize: args.party_size ?? old.party_size,
    date: args.date ?? old.date,
    time: args.time ?? old.time.slice(0, 5),
    note: old.note,
    source: 'bot',
  });
  if (!result.ok) return { ok: false, message: result.error, data: { error: result.error } };

  await supabase
    .from('reservations')
    .update({ status: 'cancelled' })
    .eq('id', old.id)
    .eq('tenant_id', ctx.tenantId)
    .in('status', ['pending', 'confirmed', 'waiting', 'notified']);
  await supabase
    .from('reservations')
    .update({ whatsapp_conversation_id: ctx.conversationId, phone_e164: phone })
    .eq('id', result.id);
  await supabase.from('whatsapp_conversations').update({ reservation_id: result.id }).eq('id', ctx.conversationId);

  const fresh = (await ownReservations(ctx)).find((x) => x.id === result.id) ?? null;
  await notifyFloor(
    ctx.tenantId,
    { es: 'Reservación cambiada por el cliente', en: 'Reservation changed by the guest' },
    {
      es: `${old.customer_name}: de ${old.date} ${old.time.slice(0, 5)} (${old.party_size}) a ${args.date ?? old.date} ${args.time ?? old.time.slice(0, 5)} (${args.party_size ?? old.party_size}). Queda pendiente.`,
      en: `${old.customer_name}: from ${old.date} ${old.time.slice(0, 5)} (${old.party_size}) to ${args.date ?? old.date} ${args.time ?? old.time.slice(0, 5)} (${args.party_size ?? old.party_size}). Now pending.`,
    },
    `res-change-${result.id}`,
  );
  return { ok: true, message: 'updated', data: { id: result.id, reservation: fresh } };
}
