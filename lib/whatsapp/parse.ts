/**
 * Understanding Spanish dates, times and counts — the fallback for when a diner
 * types instead of tapping.
 *
 * Deliberately narrow. Free-text parsing is the weak point of any bot without
 * an LLM, which is why the flow engine leads with buttons and lists; this
 * catches the common shapes and returns null rather than guessing, so the bot
 * re-asks instead of booking the wrong night.
 *
 * Pure: the caller supplies "today" so it can be tested and so it always uses
 * the RESTAURANT's date, not the server's.
 */

const strip = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const WEEKDAYS: Record<string, number> = {
  lunes: 0, martes: 1, miercoles: 2, jueves: 3, viernes: 4, sabado: 5, domingo: 6,
};

const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
  // As people shorten them: "7 nov", "12 de sept".
  ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8,
  sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12,
};

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50,
};

const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');
/** Whole names only: "mar 4" is not March the 4th when the restaurant is by the sea. */
const FULL_MONTH_RE = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const WORD_RE = Object.keys(NUMBER_WORDS).sort((a, b) => b.length - a.length).join('|');
/** A count as digits or as a word. */
const NUM = `(?:\\d{1,3}|${WORD_RE})`;

const toNumber = (token: string): number => (/^\d+$/.test(token) ? Number(token) : NUMBER_WORDS[token] ?? NaN);

const pad = (n: number) => String(n).padStart(2, '0');

function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** A calendar date that exists: 31/02 does not. */
function realDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return toIso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Mon=0…Sun=6 for an ISO date, computed without timezone involvement. */
function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** "a. m.", "P.M." and "8pm" as a plain am / pm standing apart. */
const tidyMeridiem = (s: string) =>
  s
    .replace(/(\d)\s?([ap])\s?\.?\s?m\b\.?/g, '$1 $2m')
    .replace(/\b([ap])\s?\.\s?m\b\.?/g, '$1m')
    // "8pm", "20hrs": the unit apart from the number it follows.
    .replace(/(\d)(am|pm|hrs?|horas?|h)\b/g, '$1 $2');

/** "de la mañana" is a time of day, not tomorrow: taken out before dates are read. */
const DAY_PART = /\b(?:de|en|por)\s+la\s+(manana|tarde|noche|madrugada)\b/g;

export interface ParseOptions {
  /**
   * Only what the text says outright. Used when reading a message for
   * something it was NOT asked ("somos 4 mañana a las 8" answers three
   * questions): a bare "8" is an hour when the question was the hour, and
   * nothing at all when it was not.
   */
  strict?: boolean;
}

/**
 * "mañana", "el viernes", "12/09", "12 de septiembre", "el 15", "sábado 7",
 * "el jueves de la otra semana", "en ocho días" → "YYYY-MM-DD".
 * `today` must be the restaurant's local date.
 */
export function parseSpanishDate(input: string, today: string, opts: ParseOptions = {}): string | null {
  const s = tidyMeridiem(strip(input)).replace(DAY_PART, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  const year = Number(today.slice(0, 4));

  if (/\bhoy\b/.test(s)) return today;
  if (/\bpasado\s*manana\b/.test(s)) return addDays(today, 2);
  if (/\bmanana\b/.test(s)) return addDays(today, 1);

  // "en 3 días", "dentro de dos días". "En ocho días" and "en quince días"
  // are how a week and a fortnight are said.
  const inDays = s.match(new RegExp(`\\b(?:en|dentro de)\\s+(${NUM})\\s+dias?\\b`));
  if (inDays) {
    const n = toNumber(inDays[1]);
    if (Number.isNaN(n) || n > 370) return null;
    return addDays(today, n === 8 ? 7 : n === 15 ? 14 : n);
  }

  // An explicit ISO date, e.g. from a list row id.
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return realDate(Number(iso[1]), Number(iso[2]), Number(iso[3])) ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;

  // "12 de septiembre", "12 sept", "7 de nov de 2027" — and "septiembre 12".
  const written =
    s.match(new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${MONTH_RE})\\b(?:\\s*(?:de|del)?\\s*(\\d{4}))?`)) ??
    (() => {
      const m = s.match(new RegExp(`\\b(${FULL_MONTH_RE})\\s+(\\d{1,2})\\b`));
      return m ? [m[0], m[2], m[1], undefined] as const : null;
    })();
  if (written) {
    const day = Number(written[1]);
    const month = MONTHS[written[2]];
    const given = written[3] ? Number(written[3]) : null;
    if (!realDate(given ?? year, month, day) && !realDate((given ?? year) + 1, month, day)) return null;
    if (given) return toIso(given, month, day);
    const candidate = toIso(year, month, day);
    // A date already behind us almost certainly means next year.
    return candidate < today ? toIso(year + 1, month, day) : candidate;
  }

  // "12/09" or "12-09-2026"
  const numeric = s.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let y = numeric[3] ? Number(numeric[3]) : year;
    if (y < 100) y += 2000;
    if (!realDate(y, month, day)) return null;
    const candidate = toIso(y, month, day);
    return !numeric[3] && candidate < today ? toIso(year + 1, month, day) : candidate;
  }

  const weekday = Object.entries(WEEKDAYS).find(([name]) => new RegExp(`\\b${name}\\b`).test(s));

  // The next date with a given number, this month or one of the two after.
  const nextWithDay = (day: number): string | null => {
    let [y, m] = [year, Number(today.slice(5, 7))];
    for (let tries = 0; tries < 3; tries++) {
      if (realDate(y, m, day) && toIso(y, m, day) >= today) return toIso(y, m, day);
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return null;
  };

  // "el 15", "el día 15" — and a bare "15" when the day was the question.
  const dayOnly = s.match(/\b(?:el\s+dia|el|dia)\s+(\d{1,2})\b(?!\s?(?:am|pm|hrs?|horas?|:))/) ?? (opts.strict ? null : s.match(/^(\d{1,2})$/));
  if (dayOnly) {
    const found = nextWithDay(Number(dayOnly[1]));
    // "El sábado día 8" when the 8th is a Sunday: one of the two is wrong,
    // and picking either books the wrong night. Ask again.
    if (found && weekday && weekdayOf(found) !== weekday[1]) return null;
    return found;
  }

  // "sábado 7": the 7th when it is a Saturday. When it is not, the number is
  // something else (most often the hour: "sábado 8") and the day stands.
  const dayAfterName = weekday ? s.match(new RegExp(`\\b${weekday[0]}\\s+(\\d{1,2})\\b(?!\\s?(?:am|pm|hrs?|horas?|:))`)) : null;
  if (dayAfterName && weekday) {
    const found = nextWithDay(Number(dayAfterName[1]));
    if (found && weekdayOf(found) === weekday[1]) return found;
  }

  // "el viernes" → the next one, today included. "El viernes de la otra
  // semana" → that day of next week, whichever day today is.
  if (weekday) {
    if (/\b(otra|proxima|siguiente|entrante)\s+semana\b|\bsemana\s+(que\s+viene|proxima|siguiente|entrante)\b/.test(s)) {
      return addDays(today, 7 - weekdayOf(today) + weekday[1]);
    }
    return addDays(today, (weekday[1] - weekdayOf(today) + 7) % 7);
  }

  return null;
}

const AFTER_MONTH = new RegExp(`^\\s*(?:de\\s+)?(?:${MONTH_RE})\\b`);
const HOUR = `(?:\\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)`;
const TIME_RE = new RegExp(
  `((?:a|para|tipo|como)\\s+las?\\s+|\\btipo\\s+)?\\b(${HOUR})\\b` +
  `(?:\\s?[:.]\\s?(\\d{2})\\b)?` +
  `(?:\\s+(?:y|con)\\s+(media|cuarto|\\d{1,2})\\b)?` +
  `(?:\\s+menos\\s+(cuarto|\\d{1,2})\\b)?` +
  `(?:\\s?(am|pm)\\b)?` +
  `(?:\\s+(?:de|en|por)\\s+la\\s+(manana|tarde|noche|madrugada)\\b)?` +
  `(?:\\s?(hrs?|horas?|h)\\b)?`,
  'g',
);

/**
 * "8pm", "20:30", "a las 8", "ocho y media", "8 de la noche", "9 menos
 * cuarto", "mediodía" → "HH:MM".
 *
 * An hour with nothing around it ("8", "a las 8") is taken as the evening:
 * a table asked for "a las ocho" is dinner, and the summary reads it back.
 */
export function parseSpanishTime(input: string, opts: ParseOptions = {}): string | null {
  const s = tidyMeridiem(strip(input));
  if (!s) return null;

  if (/\bmedio\s?dia\b/.test(s)) return '12:00';
  if (/\bmedia\s?noche\b/.test(s)) return '00:00';

  // "cuarto para las 9"
  const before = s.match(new RegExp(`\\b(cuarto|\\d{1,2})\\s+para\\s+las?\\s+(${HOUR})\\b`));
  if (before) {
    const h = toNumber(before[2]);
    const less = before[1] === 'cuarto' ? 15 : Number(before[1]);
    return clock(h, 0, { less, period: dayPart(s) });
  }

  for (const m of s.matchAll(TIME_RE)) {
    const [whole, lead, hourToken, minutes, plus, less, meridiem, part, unit] = m;
    // A number that belongs to a date or a count is not an hour.
    const after = s.slice((m.index ?? 0) + whole.length);
    const beforeIt = s.slice(0, m.index ?? 0);
    if (AFTER_MONTH.test(after)) continue;
    if (/^\s*[/-]\s*\d/.test(after) || /\d\s*[/-]\s*$/.test(beforeIt)) continue;
    if (/^\s*(?:personas?|pax|gente|adultos?|ninos?|comensales|lugares|invitados|dias?|anos?)\b/.test(after)) continue;
    if (/\b(?:el|dia|somos|para)\s+$/.test(beforeIt) && !lead && !minutes && !plus && !less && !meridiem && !part && !unit) continue;

    const h = toNumber(hourToken);
    const mins = minutes ? Number(minutes) : plus === 'media' ? 30 : plus === 'cuarto' ? 15 : plus ? Number(plus) : 0;
    const value = clock(h, mins, {
      less: less === 'cuarto' ? 15 : less ? Number(less) : 0,
      period: meridiem ?? part ?? null,
      // "08:30" is written on the 24-hour clock; "8:30" is said like "8".
      literal: /^0\d$/.test(hourToken),
    });
    if (!value) continue;
    if (lead || minutes || plus || less || meridiem || part || unit) return value;
  }
  if (opts.strict) return null;

  // Nothing spelled out. An hour alone ("ocho"), or a number closing the
  // sentence ("llegamos 8"), when the hour was the question.
  const alone = s.match(new RegExp(`^(${HOUR})$`)) ?? s.match(/(?<![\d/:.-])\b(\d{1,2})$/);
  return alone ? clock(toNumber(alone[1]), 0, { literal: /^0\d$/.test(alone[1]) }) : null;
}

function dayPart(s: string): string | null {
  const m = [...s.matchAll(DAY_PART)][0];
  return m ? m[1] : /\bpm\b/.test(s) ? 'pm' : /\bam\b/.test(s) ? 'am' : null;
}

function clock(hour: number, minutes: number, o: { less?: number; period?: string | null; literal?: boolean }): string | null {
  if (Number.isNaN(hour) || hour > 23 || minutes > 59) return null;
  let h = hour;
  const p = o.period;
  if (p === 'pm' || p === 'tarde' || p === 'noche') {
    if (h < 12) h += 12;
    // "12 de la noche" is midnight.
    else if (h === 12 && p === 'noche') h = 0;
  } else if (p === 'am' || p === 'manana' || p === 'madrugada') {
    if (h === 12) h = 0;
  } else if (!o.literal && h >= 1 && h <= 11) {
    h += 12;
  }
  let total = h * 60 + minutes - (o.less ?? 0);
  if (total < 0) total += 24 * 60;
  return `${pad(Math.floor(total / 60) % 24)}:${pad(total % 60)}`;
}

/** Everything that is a date or an hour, taken out so the count left is the count. */
function withoutDatesAndTimes(s: string): string {
  return s
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
    .replace(/\b\d{1,2}\s?[:.]\s?\d{2}\b(?:\s?(?:am|pm)\b)?/g, ' ')
    .replace(/\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/g, ' ')
    .replace(new RegExp(`\\b\\d{1,2}\\s*(?:de\\s+)?(?:${MONTH_RE})\\b(?:\\s*(?:de|del)?\\s*\\d{4})?`, 'g'), ' ')
    .replace(new RegExp(`\\b(?:${FULL_MONTH_RE})\\s+\\d{1,2}\\b`, 'g'), ' ')
    .replace(new RegExp(`\\b(?:a|para)\\s+las?\\s+${HOUR}\\b(?:\\s+y\\s+(?:media|cuarto|\\d{1,2}))?`, 'g'), ' ')
    .replace(new RegExp(`\\b${HOUR}\\s?(?:am|pm|hrs?|horas?)\\b`, 'g'), ' ')
    .replace(new RegExp(`\\b${HOUR}(?:\\s+y\\s+(?:media|cuarto))?\\s+(?:de|en|por)\\s+la\\s+(?:manana|tarde|noche|madrugada)\\b`, 'g'), ' ')
    .replace(new RegExp(`\\b(?:en|dentro de)\\s+${NUM}\\s+dias?\\b`, 'g'), ' ')
    .replace(/\b(?:el\s+dia|el|dia)\s+\d{1,2}\b/g, ' ')
    .replace(new RegExp(`\\b(?:${Object.keys(WEEKDAYS).join('|')})\\s+\\d{1,2}\\b`, 'g'), ' ');
}

const PEOPLE = '(?:personas?|pax|gente|adultos?|comensales|lugares|invitados|amigos|sillas)';

/**
 * How many, from "4", "cuatro", "somos 4", "para 4 personas", "4 adultos y 2
 * niños", "una pareja". Hours and dates in the same sentence are not counts:
 * "mañana a las 8 para 4" is four.
 */
export function parseCount(input: string, opts: ParseOptions = {}): number | null {
  const s = withoutDatesAndTimes(tidyMeridiem(strip(input))).replace(/\s+/g, ' ').trim();
  if (!s) return null;

  // "4 adultos y 2 niños": the table seats all of them.
  const withKids = s.match(new RegExp(`\\b(${NUM})\\s+(?:adultos?|personas?|grandes)\\s+(?:y|mas|con|\\+)\\s+(${NUM})\\s+(?:ninos?|ninas?|bebes?|menores|chicos|peques?)\\b`));
  if (withKids) {
    const n = toNumber(withKids[1]) + toNumber(withKids[2]);
    return Number.isNaN(n) ? null : n;
  }

  const said =
    s.match(new RegExp(`\\b(${NUM})\\s+${PEOPLE}\\b`)) ??
    s.match(new RegExp(`\\b(?:somos|seremos|seriamos|vamos|iremos|venimos|vendremos)\\s+(?:como\\s+|unos\\s+|unas\\s+)?(${NUM})\\b`)) ??
    s.match(new RegExp(`\\b(?:mesa|reserva\\w*|lugar|espacio)\\s+(?:para|de)\\s+(${NUM})\\b`));
  if (said) {
    const n = toNumber(said[1]);
    return Number.isNaN(n) ? null : n;
  }
  if (/\b(?:una\s+)?pareja\b|\bmi\s+(?:esposa|esposo|novia|novio|pareja)\s+y\s+yo\b/.test(s)) return 2;
  if (/\b(?:solo\s+yo|yo\s+solo|yo\s+sola|nada\s+mas\s+yo|nadamas\s+yo)\b/.test(s)) return 1;
  if (opts.strict) return null;

  const digits = s.match(/\b(\d{1,3})\b/);
  if (digits) return Number(digits[1]);
  const word = s.match(new RegExp(`\\b(${WORD_RE})\\b`));
  return word ? NUMBER_WORDS[word[1]] : null;
}

/** "4", "cuatro", "somos 4", "para 4 personas" → 4. A table for 1 to 50. */
export function parsePartySize(input: string, opts: ParseOptions = {}): number | null {
  const n = parseCount(input, opts);
  return n !== null && n >= 1 && n <= 50 ? n : null;
}

export type YesNo = 'yes' | 'no';

/**
 * A yes or a no, the ways they get typed: "sí", "simón", "va", "está bien",
 * "👍" — "no", "nel", "mejor no", "está mal". Anything else is neither, and
 * the caller asks again instead of assuming.
 */
export function parseYesNo(input: string): YesNo | null {
  const raw = input.trim();
  if (/^(?:👍|👌|✅|✔️?|🙌|🤝)/u.test(raw)) return 'yes';
  if (/^(?:👎|❌|✖️?|🚫)/u.test(raw)) return 'no';
  const s = strip(raw).replace(/[.,;:!¡¿?]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  // A no first: "no, está mal" must not be read through its "está".
  if (/^(?:no|nop|nope|nel|negativo|incorrecto|para nada|todavia no|aun no|mejor no|ya no|cancela\w*|esta mal|esta incorrecto|equivocad\w*)\b/.test(s)) return 'no';
  // "Sí, pero cámbiale la hora" is not a yes to what was read back.
  if (/\b(?:pero|cambi\w*|corrig\w*|excepto|salvo|solo que|nada mas que)\b/.test(s)) return null;
  if (/^(?:si|sii+|sip|simon|sipi|claro|correcto|confirmo|confirmar|confirmado|confirmada|confirmalo|confirmala|ok|oki|okay|okey|dale|va|vale|sale|listo|perfecto|excelente|exacto|afirmativo|adelante|andale|orale|yes|yep|asi es|asi esta bien|esta bien|esta correcto|esta perfecto|es correcto|todo bien|todo correcto|todo en orden|de acuerdo|por favor|porfa|me parece bien|bien)\b/.test(s)) return 'yes';
  return null;
}

export { strip as normalizeText };

/**
 * A WhatsApp JID without its device part: "5215512345678:12@s.whatsapp.net"
 * becomes "5215512345678@s.whatsapp.net" (and the same for "@lid"). The
 * device identifies which phone or linked computer wrote; the chat, and the
 * only address a reply may be sent to, is the user.
 */
export function stripDevicePart(jid: string): string {
  return jid.replace(/^([^:@]+):\d+@/, '$1@');
}
