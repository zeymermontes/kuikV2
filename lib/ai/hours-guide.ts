// "A las 8": morning or night? A person at the door knows from the hours the
// place keeps, and so can the bot. This works it out from the week instead
// of leaving the model to reason about opening times, which it does badly:
// measured, it asked "¿de la mañana o de la noche?" of a restaurant that
// opens at one in the afternoon. Pure.

export interface GuideDay {
  closed: boolean;
  /** "HH:MM" */
  open: string;
  close: string;
}

const minutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

/** Whether a table can be asked for at `t` (minutes) on a day with these hours. */
function fits(day: GuideDay, t: number): boolean {
  if (day.closed) return false;
  const open = minutes(day.open);
  const close = minutes(day.close);
  // Past midnight: open from the evening until the small hours.
  return close <= open ? t >= open || t < close : t >= open && t < close;
}

export interface BareHours {
  /** Said alone, these can only be morning. */
  morning: number[];
  /** Said alone, these can only be afternoon or night. */
  evening: number[];
  /** Both readings are within opening hours on some day: ask. */
  either: number[];
}

/**
 * For each hour of the clock face, which readings fall inside opening hours
 * on at least one day of the week. An hour that fits neither way is left
 * out: the answer there is that the restaurant is closed, not which half of
 * the day was meant.
 */
export function bareHours(week: GuideDay[] | null | undefined): BareHours {
  const out: BareHours = { morning: [], evening: [], either: [] };
  const days = (week ?? []).filter((d) => d && !d.closed);
  if (days.length === 0) return out;
  for (let h = 1; h <= 12; h++) {
    const am = days.some((d) => fits(d, (h % 12) * 60));
    const pm = days.some((d) => fits(d, ((h % 12) + 12) * 60));
    if (am && pm) out.either.push(h);
    else if (am) out.morning.push(h);
    else if (pm) out.evening.push(h);
  }
  return out;
}

const list = (hours: number[]): string =>
  hours.length <= 1 ? hours.join('') : `${hours.slice(0, -1).join(', ')} y ${hours[hours.length - 1]}`;

/** The fact-sheet lines that settle a bare hour, or none when there are no hours to go by. */
export function bareHourLines(week: GuideDay[] | null | undefined): string[] {
  const h = bareHours(week);
  if (h.morning.length + h.evening.length + h.either.length === 0) return [];
  const lines = ['- Una hora dicha sin «mañana», «tarde» ni «noche» (ya resuelto con el horario; síguelo tal cual):'];
  if (h.evening.length) lines.push(`  · a las ${list(h.evening)}: solo puede ser de la tarde o noche. Tómala así SIN preguntar y dila completa en el resumen ("8:00 p.m.").`);
  if (h.morning.length) lines.push(`  · a las ${list(h.morning)}: solo puede ser de la mañana o madrugada. Tómala así SIN preguntar y dila completa en el resumen.`);
  if (h.either.length) lines.push(`  · a las ${list(h.either)}: puede ser de la mañana o de la noche. NO elijas: pregunta cuál.`);
  return lines;
}
