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
};

const NUMBER_WORDS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20,
};

const pad = (n: number) => String(n).padStart(2, '0');

function toIso(y: number, m: number, d: number): string {
  return `${y}-${pad(m)}-${pad(d)}`;
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

/**
 * "mañana", "el viernes", "12/09", "12 de septiembre" → "YYYY-MM-DD".
 * `today` must be the restaurant's local date.
 */
export function parseSpanishDate(input: string, today: string): string | null {
  const s = strip(input);
  if (!s) return null;

  if (/\bhoy\b/.test(s)) return today;
  if (/\bpasado\s*manana\b/.test(s)) return addDays(today, 2);
  if (/\bmanana\b/.test(s)) return addDays(today, 1);

  // An explicit ISO date, e.g. from a list row id.
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // "12 de septiembre"
  const written = s.match(/\b(\d{1,2})\s*(?:de\s*)?([a-z]+)\b/);
  if (written && MONTHS[written[2]]) {
    const day = Number(written[1]);
    const month = MONTHS[written[2]];
    const year = Number(today.slice(0, 4));
    const candidate = toIso(year, month, day);
    // A date already behind us almost certainly means next year.
    return candidate < today ? toIso(year + 1, month, day) : candidate;
  }

  // "12/09" or "12-09-2026"
  const numeric = s.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    let year = numeric[3] ? Number(numeric[3]) : Number(today.slice(0, 4));
    if (year < 100) year += 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const candidate = toIso(year, month, day);
    return !numeric[3] && candidate < today ? toIso(year + 1, month, day) : candidate;
  }

  // "el viernes" → the next one, today included.
  for (const [name, index] of Object.entries(WEEKDAYS)) {
    if (new RegExp(`\\b${name}\\b`).test(s)) {
      const delta = (index - weekdayOf(today) + 7) % 7;
      return addDays(today, delta);
    }
  }

  return null;
}

/** "8pm", "20:30", "a las 8", "ocho y media" → "HH:MM". */
export function parseSpanishTime(input: string): string | null {
  const s = strip(input);
  if (!s) return null;

  // 20:30 / 8:30 pm
  const colon = s.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm|hrs?|horas?)?\b/);
  if (colon) {
    let h = Number(colon[1]);
    const m = Number(colon[2]);
    if (colon[3] === 'pm' && h < 12) h += 12;
    if (colon[3] === 'am' && h === 12) h = 0;
    return h < 24 && m < 60 ? `${pad(h)}:${pad(m)}` : null;
  }

  // 8pm / 8 pm
  const meridiem = s.match(/\b(\d{1,2})\s*(am|pm)\b/);
  if (meridiem) {
    let h = Number(meridiem[1]);
    if (meridiem[2] === 'pm' && h < 12) h += 12;
    if (meridiem[2] === 'am' && h === 12) h = 0;
    return h < 24 ? `${pad(h)}:00` : null;
  }

  // "ocho y media", "ocho y cuarto"
  const words = s.match(/\b([a-z]+)\s*(?:y\s*(media|cuarto))?\b/);
  if (words && NUMBER_WORDS[words[1]] !== undefined) {
    let h = NUMBER_WORDS[words[1]];
    // A restaurant asked for a table at "ocho" means 20:00, not breakfast.
    if (h >= 1 && h <= 11) h += 12;
    const m = words[2] === 'media' ? 30 : words[2] === 'cuarto' ? 15 : 0;
    return `${pad(h)}:${pad(m)}`;
  }

  // "a las 8" / bare "8"
  const bare = s.match(/(?:a\s*las?\s*)?\b(\d{1,2})\b\s*(?:hrs?|horas?)?$/);
  if (bare) {
    let h = Number(bare[1]);
    if (h >= 1 && h <= 11) h += 12;
    return h < 24 ? `${pad(h)}:00` : null;
  }

  return null;
}

/** "4", "cuatro", "somos 4", "para 4 personas" → 4. */
export function parsePartySize(input: string): number | null {
  const s = strip(input);
  const digits = s.match(/\b(\d{1,2})\b/);
  if (digits) {
    const n = Number(digits[1]);
    return n >= 1 && n <= 50 ? n : null;
  }
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(s)) return n;
  }
  return null;
}

export { strip as normalizeText };
