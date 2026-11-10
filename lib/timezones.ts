// The clock a restaurant lives by. Every "is it open", "what day is it" and
// "a las 8" the bot and the host stand compute reads `tenants.timezone`,
// which until now was set at signup to America/Mexico_City and could not be
// changed anywhere: a restaurant in Sinaloa (one hour behind) was told
// "cerrado" an hour early every night.

/** IANA names, never offsets: Mexico dropped DST in 2022 except at the border, and tzdata knows. */
export const TIMEZONES: { id: string; label: string }[] = [
  { id: 'America/Mexico_City', label: 'Centro (Ciudad de México, Guadalajara, Monterrey)' },
  { id: 'America/Mazatlan', label: 'Pacífico (Sinaloa, Nayarit, Baja California Sur)' },
  { id: 'America/Hermosillo', label: 'Sonora' },
  { id: 'America/Chihuahua', label: 'Chihuahua' },
  { id: 'America/Ciudad_Juarez', label: 'Ciudad Juárez' },
  { id: 'America/Ojinaga', label: 'Ojinaga' },
  { id: 'America/Tijuana', label: 'Baja California (Tijuana, Mexicali)' },
  { id: 'America/Matamoros', label: 'Frontera de Tamaulipas (Matamoros, Reynosa, Nuevo Laredo)' },
  { id: 'America/Cancun', label: 'Quintana Roo (Cancún, Playa del Carmen)' },
  { id: 'America/Merida', label: 'Yucatán y Campeche' },
  { id: 'America/Bahia_Banderas', label: 'Bahía de Banderas' },
  { id: 'America/Bogota', label: 'Colombia, Perú, Ecuador' },
  { id: 'America/Lima', label: 'Lima' },
  { id: 'America/Santiago', label: 'Chile' },
  { id: 'America/Argentina/Buenos_Aires', label: 'Argentina' },
  { id: 'America/Sao_Paulo', label: 'Brasil (São Paulo)' },
  { id: 'America/Guatemala', label: 'Guatemala, El Salvador, Honduras, Costa Rica' },
  { id: 'America/Panama', label: 'Panamá' },
  { id: 'America/Santo_Domingo', label: 'República Dominicana' },
  { id: 'America/Los_Angeles', label: 'Estados Unidos, Pacífico' },
  { id: 'America/Denver', label: 'Estados Unidos, Montaña' },
  { id: 'America/Chicago', label: 'Estados Unidos, Centro' },
  { id: 'America/New_York', label: 'Estados Unidos, Este' },
  { id: 'Europe/Madrid', label: 'España' },
];

/** Whether the runtime's Intl knows the zone: the only check that matters, since that is who will read it. */
export function isValidTimeZone(tz: string): boolean {
  if (!tz || tz.length > 64 || !/^[A-Za-z_]+(?:\/[A-Za-z_+-]+){1,2}$/.test(tz)) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
