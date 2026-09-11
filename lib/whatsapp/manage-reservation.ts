import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { botCancelReservation, describeReservation, type BotContext, type OwnReservation } from './actions';
import { normalizeText } from './parse';
import { sendMessage } from './send';
import type { OutboundDraft } from './types';

/**
 * "¿Cómo va mi reserva?" / "cancélala" / "muévela" — without a model.
 *
 * With AI on, the model reads the diner's bookings from its prompt and has
 * the tools; this is the scripted equivalent for AI-off restaurants (and for
 * the buttons either mode may have offered). A tiny state machine kept on
 * the conversation row: a menu (change / cancel / keep), and a yes-no before
 * a cancel. "Change" hands over to the booking flow with the old booking
 * marked for release once the new one lands (flows/complete.ts).
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface ManageState {
  reservation_id: string;
  step: 'menu' | 'cancel_confirm';
}

export const MANAGE_TRIGGER = /\b(reserva|reservacion|reservaciones|mesa|cancelar|cancela|cancelen|cambiar|cambia|modificar|mover|estado|status|confirmada|confirmaron)\b/;

const CHANGE = /^(1[.)]?|cambiar|cambiarla|cambia|modificar|mover|moverla)\b/;
const CANCEL = /^(2[.)]?|cancelar|cancelarla|cancela|cancelen)\b/;
const KEEP = /^(3[.)]?|todo bien|asi esta bien|dejala|dejarla|nada|ninguna|ok|gracias)\b/;
const YES = /^(1[.)]?|si|yes|confirmo|claro|seguro)\b/;
const NO = /^(2[.)]?|no|mejor no|dejala)\b/;

export type ManageOutcome = { handled: false } | { handled: true } | { handled: true; startBooking: true };

export async function handleManageReservation(
  supabase: Admin,
  ctx: BotContext,
  conv: { id: string; state: Record<string, unknown> | null },
  turn: { text: string; replyId?: string | null },
  reservations: OwnReservation[],
): Promise<ManageOutcome> {
  const state = (conv.state?.manage ?? null) as ManageState | null;
  const reply = turn.replyId ?? '';
  const plain = normalizeText(turn.text);

  // Entry: a button from the greeting, or the words, while a booking exists.
  if (!state) {
    if (reservations.length === 0) return { handled: false };
    const viaButton = reply.startsWith('resv:');
    if (!viaButton && !MANAGE_TRIGGER.test(plain)) return { handled: false };
    // "quiero OTRA mesa" is a new booking, not this one.
    if (!viaButton && /\b(otra|nueva|ademas|tambien)\b/.test(plain)) return { handled: false };
    const target = reservations[0];
    if (viaButton) return act(supabase, ctx, conv, target, reply.slice(5), reservations);
    await setState(supabase, conv.id, { reservation_id: target.id, step: 'menu' });
    await say(conv.id, [menu(target, reservations.length)]);
    return { handled: true };
  }

  const target = reservations.find((r) => r.id === state.reservation_id);
  if (!target) {
    await clearState(supabase, conv.id);
    await say(conv.id, [{ type: 'text', body: 'Esa reservación ya no está activa. ¿Te ayudo con algo más?' }]);
    return { handled: true };
  }

  if (state.step === 'menu') {
    const choice = reply.startsWith('resv:') ? reply.slice(5)
      : CHANGE.test(plain) ? 'change' : CANCEL.test(plain) ? 'cancel' : KEEP.test(plain) ? 'keep' : null;
    if (!choice) {
      await say(conv.id, [menu(target, reservations.length)]);
      return { handled: true };
    }
    return act(supabase, ctx, conv, target, choice, reservations);
  }

  // cancel_confirm
  const yes = reply === 'resv:yes' || YES.test(plain);
  const no = reply === 'resv:no' || (!yes && NO.test(plain));
  if (yes) {
    await clearState(supabase, conv.id);
    const res = await botCancelReservation(ctx, target.id);
    await say(conv.id, [{
      type: 'text',
      body: res.ok
        ? 'Listo, cancelamos tu reservación 👍 ¡Esperamos verte pronto! Si cambias de planes, aquí estamos.'
        : 'No pude cancelarla desde aquí; en un momento te atiende una persona.',
    }]);
    return { handled: true };
  }
  if (no) {
    await clearState(supabase, conv.id);
    await say(conv.id, [{ type: 'text', body: `Perfecto, tu reservación sigue igual: ${describeReservation(target)}.` }]);
    return { handled: true };
  }
  await say(conv.id, [confirmCancel(target)]);
  return { handled: true };
}

async function act(
  supabase: Admin,
  ctx: BotContext,
  conv: { id: string },
  target: OwnReservation,
  choice: string,
  all: OwnReservation[],
): Promise<ManageOutcome> {
  switch (choice) {
    case 'status':
      await clearState(supabase, conv.id);
      await say(conv.id, [{ type: 'text', body: statusLine(target, all.length) }]);
      return { handled: true };
    case 'change':
      // The booking flow takes it from here; the old table is released when
      // the new request is accepted (flows/complete.ts reads `replace`).
      await supabase.from('whatsapp_conversations').update({ state: { replace: target.id } }).eq('id', conv.id);
      await say(conv.id, [{ type: 'text', body: 'Va, hagamos la nueva reservación y cancelo la anterior en cuanto quede registrada.' }]);
      return { handled: true, startBooking: true };
    case 'cancel':
      await setState(supabase, conv.id, { reservation_id: target.id, step: 'cancel_confirm' });
      await say(conv.id, [confirmCancel(target)]);
      return { handled: true };
    default:
      await clearState(supabase, conv.id);
      await say(conv.id, [{ type: 'text', body: `Perfecto, tu reservación sigue igual: ${describeReservation(target)}.` }]);
      return { handled: true };
  }
}

function statusLine(r: OwnReservation, count: number): string {
  return `${count > 1 ? 'Tu próxima reservación' : 'Tu reservación'}: ${describeReservation(r)}.${
    r.status === 'pending' ? ' En cuanto el restaurante la confirme te avisamos por aquí.' : ''
  }`;
}

function menu(r: OwnReservation, count: number): OutboundDraft {
  return {
    type: 'interactive',
    body: `${statusLine(r, count)}\n\n¿Qué quieres hacer?`,
    buttons: [
      { id: 'resv:change', title: 'Cambiarla' },
      { id: 'resv:cancel', title: 'Cancelarla' },
      { id: 'resv:keep', title: 'Dejarla así' },
    ],
  };
}

function confirmCancel(r: OwnReservation): OutboundDraft {
  return {
    type: 'interactive',
    body: `¿Seguro que cancelo tu reservación del ${r.date} a las ${r.time.slice(0, 5)} para ${r.party_size}?`,
    buttons: [
      { id: 'resv:yes', title: 'Sí, cancelar' },
      { id: 'resv:no', title: 'No' },
    ],
  };
}

async function setState(supabase: Admin, conversationId: string, manage: ManageState): Promise<void> {
  await supabase.from('whatsapp_conversations').update({ state: { manage } }).eq('id', conversationId);
}

async function clearState(supabase: Admin, conversationId: string): Promise<void> {
  await supabase.from('whatsapp_conversations').update({ state: {} }).eq('id', conversationId);
}

async function say(conversationId: string, drafts: OutboundDraft[]): Promise<void> {
  for (const draft of drafts.slice(0, 2)) {
    try {
      await sendMessage(conversationId, draft, 'bot');
    } catch {
      return;
    }
  }
}
