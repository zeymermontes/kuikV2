/**
 * Block replies that state a number nothing verified.
 *
 * A system prompt is an instruction, not a control. This is the control: after
 * the model answers, every money-shaped figure in its reply is checked against
 * the figures the tools actually returned this turn. Anything unaccounted for
 * means the reply is discarded and a safe fallback is sent instead.
 *
 * Narrow on purpose — it only polices MONEY. A bot that quotes a price the
 * restaurant does not charge creates a real argument at the table, and that is
 * the failure this exists to prevent. Pure, so it is trivially testable.
 */

export interface GuardResult {
  ok: boolean;
  /** The figures that could not be traced to a tool result. */
  invented: string[];
}

/**
 * "$180", "180 pesos", "180 MXN", "$1,250.50".
 *
 * The trailing `\d` matters: without it the character class swallows the
 * sentence's full stop, so "$280." reports as `280.`.
 */
const MONEY = /(?:\$\s*(\d[\d.,]*\d|\d))|(?:\b(\d[\d.,]*\d|\d)\s*(?:pesos?|mxn|usd|dls?)\b)/gi;

function canonical(raw: string): string {
  // Drop thousands separators, keep a decimal point, then drop a trailing ".00"
  // so "$1,250.00" and a stored 1250 compare equal.
  const cleaned = raw.replace(/,(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(cleaned);
  if (Number.isNaN(n)) return cleaned;
  return String(n);
}

export function checkGrounding(reply: string, facts: string[]): GuardResult {
  const allowed = new Set(facts.map(canonical));
  const invented: string[] = [];

  for (const match of reply.matchAll(MONEY)) {
    const raw = match[1] ?? match[2];
    if (!raw) continue;
    const value = canonical(raw);
    // A bare 0 or a small count ("2 personas") is not a price claim.
    if (Number(value) < 10) continue;
    if (!allowed.has(value)) invented.push(raw);
  }

  return { ok: invented.length === 0, invented };
}

export const GROUNDING_FALLBACK =
  'Para precios exactos, mejor consulta el menú: {{menu_url}}';
