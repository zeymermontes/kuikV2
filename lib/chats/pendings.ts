// What a chat still owes its diner (migration 0102), the parts that need no
// database: how a pending's line is written, and how the bot's own words
// are read for a promise it made. Pure.

export const SUMMARY_MAX = 200;

/** A pending's line as stored: one line, single-spaced, capped. */
export function cleanSummary(raw: string): string {
  const text = raw.replace(/\s+/g, ' ').trim();
  return text.length > SUMMARY_MAX ? `${text.slice(0, SUMMARY_MAX - 1).trimEnd()}…` : text;
}

const plain = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The same thing to answer, whatever the punctuation or the accents. */
export function sameSummary(a: string, b: string): boolean {
  return plain(a) === plain(b);
}

/**
 * Does this reply tell the diner that a person will get back to them about
 * something? ("Se lo comento a alguien del restaurante para que te digan",
 * "puedo preguntarle a alguien y te aviso".)
 *
 * The model is asked to leave a pending whenever it says so, and asked is
 * all it is: when it says it without leaving one, this is what notices, and
 * the pending is written for it. Not the booking's own "el restaurante te
 * avisará para confirmarla", which already has a status of its own.
 */
export function promisesFollowUp(reply: string): boolean {
  const s = plain(reply);
  const someone = '(?:alguien|una persona|un companero|una companera|el equipo|el encargado|la encargada|el gerente|la gerente|el restaurante|un asesor)';
  return (
    new RegExp(`\\b(?:se lo|lo|le|les) (?:comento|pregunto|consulto|paso|planteo|comentare|preguntare|consultare|pasare|hago llegar) (?:a|con|al) ${someone.replace('el restaurante|', '')}`).test(s) ||
    new RegExp(`\\b(?:preguntar|consultar|comentar)(?:le|lo|selo|les)? (?:a|con|al) ${someone}`).test(s) ||
    /\bpara que (?:te|le|les) (?:digan|respondan|contesten|resuelvan|orienten)\b/.test(s) ||
    new RegExp(`\\b${someone.replace('el restaurante|', '')}(?: del restaurante| del equipo)? (?:te|le|les) (?:dira|diran|contestara|respondera|resolvera|escribira|contactara|responde|contesta|resuelve)\\b`).test(s)
  );
}

/** The pending written when the bot promised an answer and left none: the diner's own words. */
export function summaryFromDiner(said: string): string {
  const lines = said.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  // The question, when one of the lines is one; otherwise all of it.
  const asked = lines.filter((l) => /[?¿]/.test(l));
  return cleanSummary(`Preguntó: ${(asked.length ? asked : lines).join(' · ')}`);
}

export interface PendingCounts {
  /** Questions the bot or a person left to be answered. */
  questions: number;
  /** Bookings made through this chat that wait for a yes or a no. */
  bookings: number;
}

export const totalPending = (p: PendingCounts | null | undefined): number => (p ? p.questions + p.bookings : 0);
