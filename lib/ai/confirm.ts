// Nothing is booked before the diner has seen the details and said yes.
//
// The prompt asks the model for exactly that, and a prompt is an instruction,
// not a control: measured against the provider, a model in a hurry books on
// the turn the last detail arrives, or books the old hour after the diner
// answered the summary with "sí, pero a las 9". These checks are the control.
// Pure, so every case is a test.

import { longDate } from '@/lib/notify/messages';
import { parseCount, parseSpanishDate, parseSpanishTime, parseYesNo } from '@/lib/whatsapp/parse';

/** What the model is told when it may not book yet; it goes back as the tool's result. */
export type Hold = string;

/**
 * Does the diner's message change or add a detail, rather than only answer
 * the summary? Read strictly: a "sí" carries nothing, "sí, pero a las 9" and
 * "mejor el domingo" do.
 */
export function carriesDetail(said: string, today: string): boolean {
  return (
    parseSpanishTime(said, { strict: true }) !== null ||
    parseSpanishDate(said, today, { strict: true }) !== null ||
    parseCount(said, { strict: true }) !== null
  );
}

/**
 * May a flow run be finalised on this turn?
 *
 * Only when every required detail was already on record BEFORE the diner's
 * message: that is what guarantees there was an earlier turn in which the
 * bot held all of it and read it back instead of booking. And only when the
 * message itself is not a no, and does not carry a change.
 */
export function finalizeHold(input: { missingRequired: string[]; said: string; today: string }): Hold | null {
  if (input.missingRequired.length > 0) {
    return `Todavía no puedes registrarla: faltaban datos (${input.missingRequired.join(', ')}) hasta este mensaje. ` +
      'Repórtalos en `datos`, lee el resumen completo al cliente y espera su sí. Se registra en el turno siguiente, no en este.';
  }
  if (parseYesNo(input.said) === 'no') {
    return 'El cliente no confirmó. No la registres: pregunta qué quiere cambiar.';
  }
  if (carriesDetail(input.said, input.today)) {
    return 'El cliente cambió o agregó un dato en este mensaje. No la registres todavía: actualiza `datos`, ' +
      'vuelve a leerle el resumen completo ya corregido y espera su sí.';
  }
  return null;
}

/**
 * The same rule for a booking made without a flow (`crear_reserva`), where
 * nothing is on record yet: the bot's last message must have read back who
 * it is for and for how many, and the diner must not be changing it now.
 */
export function bookingHold(input: {
  lastBotMessage: string | undefined;
  args: { customer_name?: string; party_size?: number };
  said: string;
  today: string;
}): Hold | null {
  const shown = plain(input.lastBotMessage ?? '');
  const name = plain(input.args.customer_name ?? '').split(' ')[0];
  const readBack = Boolean(name) && shown.includes(name) && new RegExp(`\\b${input.args.party_size}\\b`).test(shown);
  if (!readBack) {
    return 'Todavía no puedes registrarla: primero lee el resumen completo al cliente (personas, día, hora y nombre) y espera su sí.';
  }
  if (parseYesNo(input.said) === 'no') return 'El cliente no confirmó. No la registres: pregunta qué quiere cambiar.';
  if (carriesDetail(input.said, input.today)) {
    return 'El cliente cambió o agregó un dato en este mensaje. No la registres todavía: vuelve a leerle el resumen ya corregido y espera su sí.';
  }
  return null;
}

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();

/**
 * The summary, written by the server. Sent in place of a reply in which the
 * model claimed a booking it was not allowed to make: the diner gets the
 * question they were owed instead of a "quedó registrada" that is not true.
 */
export function summaryOf(
  slots: { key: string; label: string; type: string }[],
  answers: Record<string, unknown>,
): string {
  const lines = slots
    .filter((s) => answers[s.key] !== undefined && answers[s.key] !== '')
    .map((s) => {
      const v = answers[s.key];
      const shown = s.type === 'date' && typeof v === 'string' ? longDate(v, 'es') : s.type === 'time' && typeof v === 'string' ? twelveHour(v) : String(v);
      return `• ${s.label}: ${shown}`;
    });
  return `Antes de registrarla, le confirmo los datos:\n\n${lines.join('\n')}\n\n¿Es correcto?`;
}

/** "20:00" as it is said: "8:00 p.m." */
function twelveHour(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

/**
 * The one date a message states outright, if it states exactly one: "el
 * sábado", "mañana", "7 de noviembre". Null when it names none, more than
 * one, or one that people mean two ways ("el próximo sábado" is this week's
 * for some and next week's for others): those are the model's to ask about.
 *
 * Used to check the date the model writes down against what was said. The
 * model reads intent well and counts days badly; this counts days.
 */
export function dateSaid(said: string, today: string): string | null {
  const found = new Set<string>();
  for (const line of said.split(/\n+/)) {
    const text = plain(line).replace(/\b(?:de|en|por) la manana\b/g, ' ');
    if (!text) continue;
    if (/\b(proxim[oa]|siguiente|que viene|entrante|otr[oa])\b/.test(text)) return null;
    // Two days in one breath ("hoy no, mejor mañana") is a change of mind,
    // and which of the two stands is not for a parser to say.
    const relative = (text.match(/\b(?:hoy|pasado manana|manana|ayer|antier)\b/g) ?? []).length;
    const named = (text.match(/\b(?:lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/g) ?? []).length;
    if (relative + named > 1) return null;
    const date = parseSpanishDate(line, today, { strict: true });
    if (date) found.add(date);
  }
  return found.size === 1 ? [...found][0] : null;
}

/** Mon=0…Sun=6. */
export function weekdayOfIso(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/**
 * Is the date the model wants to write down the wrong one, going by what the
 * diner said? Returns the date that was said, or null when there is nothing
 * to object to.
 *
 * `now` is this turn's message, `earlier` the diner's previous ones, newest
 * first. A date stated now always decides. One stated earlier only counts
 * against the same weekday on another week — the mistake actually seen ("el
 * sábado", a Friday, written as the Saturday after) — because a different
 * day altogether is usually a change the two of them agreed on since.
 */
export function dateMismatch(input: { written: string; now: string; earlier: string[]; today: string }): string | null {
  const now = dateSaid(input.now, input.today);
  if (now) return now === input.written ? null : now;
  for (const text of input.earlier) {
    const said = dateSaid(text, input.today);
    if (!said) continue;
    return said !== input.written && weekdayOfIso(said) === weekdayOfIso(input.written) ? said : null;
  }
  return null;
}
