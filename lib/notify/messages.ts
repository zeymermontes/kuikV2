import type { NotificationKind } from './types';

/**
 * What the diner reads. Kept as plain functions rather than next-intl because
 * these are rendered from a cron job and from a fire-and-forget path, neither
 * of which has a request locale — and because the language that matters is the
 * RESTAURANT's, not the staff member's.
 */

type Vars = {
  restaurant: string;
  name: string;
  party: number;
  date: string;
  time: string;
};

const ES: Record<NotificationKind, (v: Vars) => string> = {
  confirmed: (v) =>
    `¡Hola ${v.name}! Tu reservación en ${v.restaurant} para ${v.party} ` +
    `personas el ${v.date} a las ${v.time} quedó confirmada. ¡Te esperamos!`,
  cancelled: (v) =>
    `Hola ${v.name}. Lamentamos avisarte que no pudimos tomar tu reservación en ` +
    `${v.restaurant} para el ${v.date} a las ${v.time}. ¿Buscamos otro horario?`,
  reminder_24h: (v) =>
    `¡Hola ${v.name}! Te recordamos tu reservación en ${v.restaurant} mañana ` +
    `${v.date} a las ${v.time} para ${v.party} personas. Si no puedes venir, avísanos.`,
};

const EN: Record<NotificationKind, (v: Vars) => string> = {
  confirmed: (v) =>
    `Hi ${v.name}! Your table at ${v.restaurant} for ${v.party} on ${v.date} ` +
    `at ${v.time} is confirmed. See you soon!`,
  cancelled: (v) =>
    `Hi ${v.name}. We're sorry — we couldn't take your booking at ${v.restaurant} ` +
    `on ${v.date} at ${v.time}. Shall we look for another time?`,
  reminder_24h: (v) =>
    `Hi ${v.name}! A reminder about your table at ${v.restaurant} tomorrow, ` +
    `${v.date} at ${v.time}, for ${v.party}. Let us know if you can't make it.`,
};

export function renderNotification(
  kind: NotificationKind,
  locale: string,
  vars: Vars,
): string {
  return (locale === 'en' ? EN : ES)[kind](vars);
}
