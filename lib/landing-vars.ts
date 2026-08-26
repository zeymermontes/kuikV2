import 'server-only';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { tenantBaseUrl } from '@/lib/config';
import { parseWeekHours, todayHoursIn, mapHref, DAY_KEYS } from '@/lib/hours';
import { digitsOnly } from '@/lib/utils';
import { LANDING_VARIABLES } from '@/lib/landing-variables';

export { LANDING_VARIABLES };

/**
 * Values a custom landing can interpolate, resolved at SERVE time.
 *
 * The point is that a restaurant changes its phone number in Kuik and the
 * uploaded site picks it up on the next request — no regenerating and
 * re-uploading a ZIP for what is really a settings change. The ZIP holds
 * `{{telefono}}`; this decides what that means today.
 */

export interface LandingVars {
  [key: string]: string;
}

const DAY_LABELS: Record<string, string> = {
  mon: 'Lunes', tue: 'Martes', wed: 'Miércoles', thu: 'Jueves',
  fri: 'Viernes', sat: 'Sábado', sun: 'Domingo',
};

/**
 * Cached per request: a page pulls a stylesheet and a script that all want the
 * same values, and this should be one query, not three.
 */
export const getLandingVars = cache(async (tenantId: string): Promise<LandingVars> => {
  const supabase = createAdminClient();

  const [{ data: tenant }, { data: contact }, { data: theme }] = await Promise.all([
    supabase.from('tenants').select('name, subdomain, custom_domain, timezone').eq('id', tenantId).maybeSingle(),
    supabase.from('tenant_contact').select('*').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('tenant_theme').select('logo_url, logo_wide_url, cover_image_url, primary_color, secondary_color, background_color, text_color, button_color').eq('tenant_id', tenantId).maybeSingle(),
  ]);

  const t = tenant as {
    name: string; subdomain: string; custom_domain: string | null; timezone: string;
  } | null;
  if (!t) return {};

  const c = (contact ?? {}) as Record<string, string | null | undefined>;
  const th = (theme ?? {}) as Record<string, string | null | undefined>;

  const base = tenantBaseUrl(t.subdomain, t.custom_domain);
  const week = parseWeekHours(c.hours);
  const today = week ? todayHoursIn(week, t.timezone) : null;
  const phone = c.whatsapp_phone ?? '';

  return {
    nombre: t.name,
    telefono: phone,
    telefono_digitos: phone ? digitsOnly(phone) : '',
    whatsapp_url: phone ? `https://wa.me/${digitsOnly(phone)}` : '',
    email: c.email ?? '',
    direccion: c.address ?? '',
    mapa_url: mapHref(c.maps_url ?? null, c.address ?? null) ?? '',
    horario_hoy: today ? (today.closed ? 'Cerrado' : `${today.open} a ${today.close}`) : '',
    horario_semana: week
      ? week.map((d, i) => `${DAY_LABELS[DAY_KEYS[i]]}: ${d.closed ? 'Cerrado' : `${d.open} a ${d.close}`}`).join('\n')
      : '',
    menu_url: `${base}/menu`,
    // A plain link that lands on the menu with the booking sheet already open —
    // no JavaScript needed on the landing's side.
    reservar_url: `${base}/menu?reservar=1`,
    home_url: base,
    instagram: c.instagram ?? '',
    facebook: c.facebook ?? '',
    sitio_web: c.website ?? '',
    logo_url: th.logo_url ?? '',
    logo_horizontal_url: th.logo_wide_url ?? '',
    portada_url: th.cover_image_url ?? '',
    color_primario: th.primary_color ?? '',
    color_secundario: th.secondary_color ?? '',
    color_fondo: th.background_color ?? '',
    color_texto: th.text_color ?? '',
    color_boton: th.button_color ?? '',
    anio: String(new Date().getFullYear()),
  };
});

/**
 * Replace `{{variable}}` occurrences.
 *
 * An unknown name is left exactly as written rather than blanked: a landing may
 * legitimately contain `{{...}}` belonging to its own template engine, and
 * silently eating it would be worse than leaving it visible.
 */
export function applyLandingVars(source: string, vars: LandingVars): string {
  return source.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (whole, key: string) => {
    const value = vars[key.toLowerCase()];
    return value === undefined ? whole : value;
  });
}

/** Only text files are worth rewriting; images and fonts stream through. */
export function isSubstitutable(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return ['html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'svg', 'xml'].includes(ext);
}
