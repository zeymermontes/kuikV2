import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

/**
 * Phone normalisation for matching, not for display.
 *
 * `digitsOnly()` in lib/utils.ts is fine for building a wa.me link — WhatsApp
 * tolerates sloppy input there. It is NOT enough for the bot, because of one
 * quirk that breaks every lookup silently:
 *
 *   WhatsApp reports Mexican numbers as  521 55 1234 5678  (13 digits)
 *   while the dialable E.164 number is    52 55 1234 5678  (12 digits)
 *
 * That leading `1` is a WhatsApp artifact, not part of E.164 — libphonenumber
 * agrees, and marks `+5215512345678` invalid. So `digitsOnly('+52 55 1234 5678')`
 * can never equal the `wa_id` the webhook hands us, and "which reservation
 * belongs to this caller?" returns nothing, with no error to notice.
 *
 * Two rules that callers must follow:
 *   1. ALWAYS send to the exact `wa_id` Meta gave you. Never reconstruct it.
 *   2. Use `phone_e164` ONLY for matching, dedupe and display.
 */

/** Argentina keeps its mobile `9` in E.164; Mexico's `1` is WhatsApp-only. */
const WA_MOBILE_MARKERS: { cc: string; marker: string; nationalLen: number }[] = [
  { cc: '52', marker: '1', nationalLen: 10 },
];

/**
 * National trunk prefixes people still type out of habit. Mexico retired 044
 * and 045 in 2019 but they are all over hand-entered data.
 */
const TRUNK_PREFIXES: Record<string, string[]> = {
  MX: ['044', '045', '01'],
};

/**
 * Turn a `wa_id` (digits, no `+`) into canonical E.164.
 * `5215512345678` → `+525512345678`.
 */
export function normalizeWaId(waId: string): string {
  const digits = (waId ?? '').replace(/\D/g, '');
  if (!digits) return '';

  for (const { cc, marker, nationalLen } of WA_MOBILE_MARKERS) {
    const prefix = cc + marker;
    if (digits.startsWith(prefix) && digits.length === cc.length + marker.length + nationalLen) {
      return `+${cc}${digits.slice(prefix.length)}`;
    }
  }
  return `+${digits}`;
}

/**
 * Canonical E.164, or null when the input can't be understood as a real number.
 * `defaultIso` supplies the country for numbers typed without one.
 */
export function toE164(input: string, defaultIso = 'MX'): string | null {
  if (!input) return null;
  let cleaned = input.trim();

  // A number with no country code may carry a trunk prefix that would otherwise
  // be parsed as part of the subscriber number.
  if (!cleaned.startsWith('+')) {
    const digits = cleaned.replace(/\D/g, '');
    for (const prefix of TRUNK_PREFIXES[defaultIso] ?? []) {
      if (digits.startsWith(prefix)) {
        cleaned = digits.slice(prefix.length);
        break;
      }
    }
  }

  // Strip a WhatsApp mobile marker before parsing — libphonenumber rejects it.
  const bare = cleaned.replace(/\D/g, '');
  if (bare.length >= 12) {
    const normalized = normalizeWaId(bare);
    if (normalized !== `+${bare}`) cleaned = normalized;
  }

  const parsed = parsePhoneNumberFromString(cleaned, defaultIso as never);
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/**
 * The forms a WhatsApp `wa_id` might take for a canonical number, most likely
 * first. Only for matching legacy rows — to SEND, use the stored `wa_id`.
 */
export function waIdCandidates(e164: string): string[] {
  const digits = (e164 ?? '').replace(/\D/g, '');
  if (!digits) return [];
  const out = [digits];
  for (const { cc, marker, nationalLen } of WA_MOBILE_MARKERS) {
    if (digits.startsWith(cc) && digits.length === cc.length + nationalLen) {
      out.push(`${cc}${marker}${digits.slice(cc.length)}`);
    }
  }
  return out;
}

/** True when two numbers in any format refer to the same line. */
export function sameNumber(a: string | null, b: string | null, defaultIso = 'MX'): boolean {
  if (!a || !b) return false;
  const na = toE164(a, defaultIso) ?? normalizeWaId(a);
  const nb = toE164(b, defaultIso) ?? normalizeWaId(b);
  return Boolean(na) && na === nb;
}
