export interface Country {
  iso: string; // ISO 3166-1 alpha-2 — unique key (dial codes are not, e.g. +1)
  name: string;
  flag: string;
  dial: string; // country calling code, digits only
}

// Curated for Kuik's audience (Latin America + US/Canada/Spain). Mexico is first
// so it is the default selection. Extend as needed.
export const COUNTRIES: Country[] = [
  { iso: 'MX', name: 'México', flag: '🇲🇽', dial: '52' },
  { iso: 'US', name: 'Estados Unidos', flag: '🇺🇸', dial: '1' },
  { iso: 'CA', name: 'Canadá', flag: '🇨🇦', dial: '1' },
  { iso: 'GT', name: 'Guatemala', flag: '🇬🇹', dial: '502' },
  { iso: 'SV', name: 'El Salvador', flag: '🇸🇻', dial: '503' },
  { iso: 'HN', name: 'Honduras', flag: '🇭🇳', dial: '504' },
  { iso: 'NI', name: 'Nicaragua', flag: '🇳🇮', dial: '505' },
  { iso: 'CR', name: 'Costa Rica', flag: '🇨🇷', dial: '506' },
  { iso: 'PA', name: 'Panamá', flag: '🇵🇦', dial: '507' },
  { iso: 'CO', name: 'Colombia', flag: '🇨🇴', dial: '57' },
  { iso: 'VE', name: 'Venezuela', flag: '🇻🇪', dial: '58' },
  { iso: 'EC', name: 'Ecuador', flag: '🇪🇨', dial: '593' },
  { iso: 'PE', name: 'Perú', flag: '🇵🇪', dial: '51' },
  { iso: 'BO', name: 'Bolivia', flag: '🇧🇴', dial: '591' },
  { iso: 'CL', name: 'Chile', flag: '🇨🇱', dial: '56' },
  { iso: 'AR', name: 'Argentina', flag: '🇦🇷', dial: '54' },
  { iso: 'PY', name: 'Paraguay', flag: '🇵🇾', dial: '595' },
  { iso: 'UY', name: 'Uruguay', flag: '🇺🇾', dial: '598' },
  { iso: 'BR', name: 'Brasil', flag: '🇧🇷', dial: '55' },
  { iso: 'DO', name: 'República Dominicana', flag: '🇩🇴', dial: '1' },
  { iso: 'PR', name: 'Puerto Rico', flag: '🇵🇷', dial: '1' },
  { iso: 'CU', name: 'Cuba', flag: '🇨🇺', dial: '53' },
  { iso: 'ES', name: 'España', flag: '🇪🇸', dial: '34' },
];

export const DEFAULT_COUNTRY = 'MX';

export function dialFor(iso: string): string {
  return COUNTRIES.find((c) => c.iso === iso)?.dial ?? COUNTRIES[0].dial;
}
