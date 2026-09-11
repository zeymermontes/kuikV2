/**
 * The country picker next to a phone field. Kuik's restaurants are in
 * Mexico first, so +52 is the default; the rest is the Americas plus Spain,
 * which covers who actually books a table here.
 *
 * Pure helpers, no React: the same split/join runs on the door tablet and
 * in the office, and is what the tests exercise.
 */

import { parsePhoneNumberFromString } from 'libphonenumber-js/min';

export interface PhoneCountry {
  iso: string;
  dial: string;
  flag: string;
  name: string;
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: 'MX', dial: '52', flag: '🇲🇽', name: 'México' },
  { iso: 'US', dial: '1', flag: '🇺🇸', name: 'Estados Unidos' },
  { iso: 'CA', dial: '1', flag: '🇨🇦', name: 'Canadá' },
  { iso: 'GT', dial: '502', flag: '🇬🇹', name: 'Guatemala' },
  { iso: 'SV', dial: '503', flag: '🇸🇻', name: 'El Salvador' },
  { iso: 'HN', dial: '504', flag: '🇭🇳', name: 'Honduras' },
  { iso: 'NI', dial: '505', flag: '🇳🇮', name: 'Nicaragua' },
  { iso: 'CR', dial: '506', flag: '🇨🇷', name: 'Costa Rica' },
  { iso: 'PA', dial: '507', flag: '🇵🇦', name: 'Panamá' },
  { iso: 'CO', dial: '57', flag: '🇨🇴', name: 'Colombia' },
  { iso: 'VE', dial: '58', flag: '🇻🇪', name: 'Venezuela' },
  { iso: 'EC', dial: '593', flag: '🇪🇨', name: 'Ecuador' },
  { iso: 'PE', dial: '51', flag: '🇵🇪', name: 'Perú' },
  { iso: 'BO', dial: '591', flag: '🇧🇴', name: 'Bolivia' },
  { iso: 'CL', dial: '56', flag: '🇨🇱', name: 'Chile' },
  { iso: 'AR', dial: '54', flag: '🇦🇷', name: 'Argentina' },
  { iso: 'UY', dial: '598', flag: '🇺🇾', name: 'Uruguay' },
  { iso: 'PY', dial: '595', flag: '🇵🇾', name: 'Paraguay' },
  { iso: 'BR', dial: '55', flag: '🇧🇷', name: 'Brasil' },
  { iso: 'DO', dial: '1809', flag: '🇩🇴', name: 'República Dominicana' },
  { iso: 'CU', dial: '53', flag: '🇨🇺', name: 'Cuba' },
  { iso: 'ES', dial: '34', flag: '🇪🇸', name: 'España' },
];

export const DEFAULT_PHONE_COUNTRY = 'MX';

/**
 * Split a stored number into the picker's two halves. A "+" number is read
 * by its dial code (longest match wins, so +1809 is the DR, not the US); a
 * bare number is taken as the default country's, with WhatsApp's Mexican
 * "1" marker and the old 044/045 trunk prefixes stripped so what the host
 * sees is the ten digits they would dial.
 */
export function splitPhone(value: string | null | undefined, defaultIso = DEFAULT_PHONE_COUNTRY): { iso: string; national: string } {
  const raw = (value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return { iso: defaultIso, national: '' };

  if (raw.startsWith('+')) {
    const match = [...PHONE_COUNTRIES]
      .sort((a, b) => b.dial.length - a.dial.length)
      .find((c) => digits.startsWith(c.dial));
    if (match) return { iso: match.iso, national: stripMarker(match, digits.slice(match.dial.length)) };
    return { iso: defaultIso, national: digits };
  }

  const c = PHONE_COUNTRIES.find((x) => x.iso === defaultIso) ?? PHONE_COUNTRIES[0];
  let national = digits;
  // Typed with the country code but without the "+": "52 662 123 4567".
  if (national.length > 10 && national.startsWith(c.dial)) national = national.slice(c.dial.length);
  return { iso: c.iso, national: stripMarker(c, national) };
}

function stripMarker(c: PhoneCountry, national: string): string {
  let n = national;
  if (c.iso === 'MX') {
    if (n.length === 11 && n.startsWith('1')) n = n.slice(1);
    for (const p of ['044', '045', '01']) if (n.length > 10 && n.startsWith(p)) n = n.slice(p.length);
  }
  return n;
}

/**
 * The two halves back into one E.164 string, or '' when nothing was typed.
 * libphonenumber does the joining when it recognises the number, so each
 * country's own habits are handled — Argentina's "15" mobile prefix and "0"
 * trunk, Spain's nine digits, the US area code — and only an unrecognised
 * input falls back to dial code + digits, so nothing typed is ever lost.
 */
export function joinPhone(iso: string, national: string): string {
  const digits = national.replace(/\D/g, '');
  if (!digits) return '';
  const parsed = parsePhoneNumberFromString(national, iso as never);
  if (parsed?.isValid()) return parsed.number;
  const c = PHONE_COUNTRIES.find((x) => x.iso === iso) ?? PHONE_COUNTRIES[0];
  return `+${c.dial}${digits}`;
}

/** True when the national digits make a real number for that country; null while empty. */
export function phoneLooksValid(iso: string, national: string): boolean | null {
  if (!national.replace(/\D/g, '')) return null;
  return parsePhoneNumberFromString(national, iso as never)?.isValid() ?? false;
}
