import type { NotificationKind } from './types';

/**
 * What the diner reads. Kept as plain functions rather than next-intl because
 * these are rendered from a cron job and from a fire-and-forget path, neither
 * of which has a request locale — and because the language that matters is the
 * RESTAURANT's, not the staff member's.
 *
 * Laid out like the bot's own summary — one line per fact, with an icon and
 * the date spelled out — so a confirmation reads like the request it answers.
 */

type Vars = {
  restaurant: string;
  name: string;
  party: number;
  date: string;
  time: string;
};

/** "Miércoles 16 de septiembre de 2026" / "Wednesday, September 16, 2026" from "YYYY-MM-DD". */
export function longDate(iso: string, locale: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  const text = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "6:00 pm" from "18:00". */
export function clock12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const suffix = h >= 12 ? 'pm' : 'am';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

function card(v: Vars, locale: string, extra?: string): string {
  const people = locale === 'en'
    ? `${v.party} ${v.party === 1 ? 'person' : 'people'}`
    : `${v.party} ${v.party === 1 ? 'persona' : 'personas'}`;
  const lines = [
    `📅 ${longDate(v.date, locale)}`,
    `🕕 ${clock12(v.time)}`,
    `👥 ${people}`,
    `🙋 ${locale === 'en' ? 'Under the name of' : 'A nombre de'} ${v.name}`,
  ];
  if (extra) lines.push(extra);
  return lines.join('\n');
}

const ES: Record<NotificationKind, (v: Vars) => string> = {
  confirmed: (v) =>
    `¡Hola ${v.name}! Tu reservación en *${v.restaurant}* quedó *confirmada* ✅\n\n${card(v, 'es')}\n\n¡Te esperamos!`,
  cancelled: (v) =>
    `Hola ${v.name}. Lamentamos avisarte que *no pudimos tomar* tu reservación en *${v.restaurant}* 😔\n\n${card(v, 'es')}\n\n¿Buscamos otro horario?`,
  reminder_24h: (v) =>
    `¡Hola ${v.name}! Te recordamos tu reservación en *${v.restaurant}* mañana 🔔\n\n${card(v, 'es')}\n\nResponde *1* para confirmar o *2* si ya no puedes venir.`,
};

const EN: Record<NotificationKind, (v: Vars) => string> = {
  confirmed: (v) =>
    `Hi ${v.name}! Your table at *${v.restaurant}* is *confirmed* ✅\n\n${card(v, 'en')}\n\nSee you soon!`,
  cancelled: (v) =>
    `Hi ${v.name}. We're sorry — we *couldn't take* your booking at *${v.restaurant}* 😔\n\n${card(v, 'en')}\n\nShall we look for another time?`,
  reminder_24h: (v) =>
    `Hi ${v.name}! A reminder about your table at *${v.restaurant}* tomorrow 🔔\n\n${card(v, 'en')}\n\nReply *1* to confirm or *2* if you can't make it.`,
};

export function renderNotification(
  kind: NotificationKind,
  locale: string,
  vars: Vars,
): string {
  return (locale === 'en' ? EN : ES)[kind](vars);
}
