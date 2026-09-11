import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMenu } from '@/lib/tenant';
import { parseWeekHours } from '@/lib/hours';
import { addDays, nowHHMMInTz, todayInTz, weekdayInTz } from '@/lib/time';
import { formatPrice } from '@/lib/utils';
import { dayAvailability, weekdayOfDate } from '@/lib/reservations/day';
import type { RenderVars } from '@/lib/whatsapp/render';
import { renderTemplate } from '@/lib/whatsapp/render';

/**
 * The restaurant's fact sheet: one structured block the model reads before
 * the conversation, instead of discovering the hours, the address, the
 * booking policy and the small print one tool call at a time.
 *
 * Why a sheet and not more tools: every tool call is a model round trip
 * (latency, budget, a chance to time out mid-booking), and a model that has
 * to ASK whether reservations are on tends not to. The sheet states what
 * is true today — open now, closed weekdays, days already full — so the
 * answer to "¿puedo reservar el sábado?" needs no lookup. The tools stay for
 * what the sheet cannot hold: a long menu, the FAQ overflow.
 *
 * Everything on the sheet is a fact the grounding guard must accept, so
 * the numbers it carries come back as `facts`.
 */

const DAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const DAY_SHORT = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
/** Above this the menu goes out as categories only; `buscar_menu` finds the rest. */
const MENU_INLINE_MAX = 80;
const FAQ_INLINE_MAX = 25;
const LOOKAHEAD_DAYS = 14;

export interface RestaurantContext {
  text: string;
  facts: string[];
}

export async function buildRestaurantContext(params: {
  tenantId: string;
  branchId: string | null;
  vars: RenderVars;
  reservationsEnabled: boolean;
}): Promise<RestaurantContext> {
  const supabase = createAdminClient();
  const { tenantId, branchId, vars } = params;

  const [{ data: tenant }, { data: contact }, { data: branch }, { data: ordering }, { data: faqs }, menu] = await Promise.all([
    supabase.from('tenants').select('timezone, locale').eq('id', tenantId).maybeSingle(),
    supabase
      .from('tenant_contact')
      .select('hours, reservation_slot_minutes, reservation_max_party, reservation_lead_minutes, reservation_max_days, reservation_required')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
    branchId ? supabase.from('branches').select('name, hours').eq('id', branchId).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('tenant_ordering').select('ordering_enabled, ordering_online_enabled, min_order').eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('whatsapp_faqs').select('topic, answer').eq('tenant_id', tenantId).eq('enabled', true).order('position').limit(FAQ_INLINE_MAX + 1),
    getMenu(tenantId, branchId).catch(() => []),
  ]);

  const tz = (tenant as { timezone: string | null } | null)?.timezone ?? null;
  const c = contact as {
    hours: unknown; reservation_slot_minutes: number | null; reservation_max_party: number | null;
    reservation_lead_minutes: number | null; reservation_max_days: number | null; reservation_required: Record<string, boolean> | null;
  } | null;
  const b = branch as { name: string; hours: unknown } | null;
  const week = parseWeekHours(b?.hours ?? c?.hours);
  const today = todayInTz(tz);
  const nowHHMM = nowHHMMInTz(tz);
  const wd = weekdayInTz(tz);

  const lines: string[] = ['FICHA DEL RESTAURANTE (fuente de verdad: todo lo de aquí puedes afirmarlo sin consultar herramientas):'];
  lines.push(`- Nombre: ${vars.restaurante ?? ''}${b ? ` · Sucursal: ${b.name}` : ''}`);

  // Today, with the clock: "abierto hasta las 22:00" is the answer to half
  // the questions a bot gets.
  const todayHours = week?.[wd];
  const openNow = todayHours && !todayHours.closed && between(nowHHMM, todayHours.open, todayHours.close);
  lines.push(
    `- Hoy: ${DAY_NAMES[wd]} ${today}, hora local ${nowHHMM}. Ahora: ${
      !todayHours ? 'horario no configurado' : todayHours.closed ? 'CERRADO (hoy no abre)' : openNow ? `ABIERTO hasta las ${todayHours.close}` : `CERRADO (hoy abre de ${todayHours.open} a ${todayHours.close})`
    }`,
  );
  if (week) {
    lines.push('- Horario semanal:');
    for (const [i, d] of week.entries()) lines.push(`  ${DAY_SHORT[i]}: ${d.closed ? 'cerrado' : `${d.open}–${d.close}`}`);
  }
  if (vars.direccion) lines.push(`- Dirección: ${vars.direccion}${vars.mapa ? ` · Mapa: ${vars.mapa}` : ''}`);
  if (vars.telefono) lines.push(`- Teléfono / WhatsApp: ${vars.telefono}`);
  if (vars.menu_url) lines.push(`- Menú digital: ${vars.menu_url}`);

  const o = ordering as { ordering_enabled: boolean; ordering_online_enabled: boolean; min_order: number | null } | null;
  if (o) {
    lines.push(
      `- Pedidos: ${o.ordering_enabled ? `sí, desde el menú digital${o.ordering_online_enabled ? ' (con pago en línea)' : ' (se confirman por WhatsApp)'}${o.min_order ? ` · mínimo ${formatPrice(o.min_order)}` : ''}` : 'no se toman pedidos por este medio'}`,
    );
  }

  // Booking policy and the calendar ahead.
  if (!params.reservationsEnabled) {
    lines.push('- Reservaciones en línea: DESACTIVADAS. No tomes datos de reserva; ofrece el teléfono o que alguien del restaurante le escriba.');
  } else {
    const policy = [
      c?.reservation_lead_minutes ? `con al menos ${c.reservation_lead_minutes} min de anticipación` : null,
      c?.reservation_max_days ? `hasta ${c.reservation_max_days} días adelante` : null,
      c?.reservation_max_party ? `hasta ${c.reservation_max_party} personas (más: lo atiende una persona)` : null,
    ].filter(Boolean);
    lines.push(`- Reservaciones en línea: activas${policy.length ? ` · ${policy.join(' · ')}` : ''}. Quedan como solicitud; el restaurante confirma después.`);

    const calendar = await upcomingDays(supabase, { tenantId, branchId, today, week, slotMinutes: c?.reservation_slot_minutes ?? 30, maxDays: c?.reservation_max_days ?? 60 });
    if (calendar.length) lines.push(`- Próximos días SIN lugar para reservar: ${calendar.join(', ')}.`);
  }

  // The small print, inline while it is short.
  const faqRows = (faqs ?? []) as { topic: string; answer: string }[];
  if (faqRows.length > 0) {
    lines.push(`- Información adicional${faqRows.length > FAQ_INLINE_MAX ? ' (parcial; el resto con consultar_info)' : ''}:`);
    for (const f of faqRows.slice(0, FAQ_INLINE_MAX)) lines.push(`  · ${f.topic}: ${renderTemplate(f.answer, vars).replace(/\s+/g, ' ').slice(0, 300)}`);
  }

  // The menu, whole when it fits.
  const products = flattenMenu(menu as MenuLike);
  if (products.length > 0) {
    if (products.length <= MENU_INLINE_MAX) {
      lines.push('- Menú (precio; "agotado" = hoy no hay):');
      const byCat = new Map<string, string[]>();
      for (const p of products) {
        const list = byCat.get(p.category) ?? [];
        list.push(`${p.name}${p.price != null ? ` ${formatPrice(p.price)}` : ''}${p.available ? '' : ' (agotado)'}`);
        byCat.set(p.category, list);
      }
      for (const [cat, items] of byCat) lines.push(`  · ${cat}: ${items.join(' · ')}`);
    } else {
      const counts = new Map<string, number>();
      for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
      lines.push(`- Menú: ${[...counts].map(([cat, n]) => `${cat} (${n})`).join(', ')}. Precios y disponibilidad con buscar_menu.`);
    }
  }

  const text = lines.join('\n');
  return { text, facts: (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.')) };
}

function between(now: string, open: string, close: string): boolean {
  const m = (s: string) => {
    const [h, mm] = s.split(':').map(Number);
    return (h || 0) * 60 + (mm || 0);
  };
  const n = m(now);
  const o = m(open);
  const cl = m(close);
  return cl <= o ? n >= o || n < cl : n >= o && n < cl;
}

/** The days ahead a diner cannot book, with why: "sáb 2026-09-12 (lleno)". */
async function upcomingDays(
  supabase: ReturnType<typeof createAdminClient>,
  p: { tenantId: string; branchId: string | null; today: string; week: ReturnType<typeof parseWeekHours>; slotMinutes: number; maxDays: number },
): Promise<string[]> {
  const until = addDays(p.today, LOOKAHEAD_DAYS);
  const [{ data: areas }, { data: taken }] = await Promise.all([
    supabase.from('reservation_areas').select('id, max_covers, branch_id').eq('tenant_id', p.tenantId).eq('public_bookable', true),
    supabase
      .from('reservations')
      .select('area_id, date, time, party_size')
      .eq('tenant_id', p.tenantId)
      .gte('date', p.today)
      .lte('date', until)
      .in('status', ['pending', 'confirmed', 'arrived', 'partial', 'seated']),
  ]);
  const areaRows = ((areas ?? []) as { id: string; max_covers: number | null; branch_id: string | null }[])
    .filter((a) => !a.branch_id || !p.branchId || a.branch_id === p.branchId)
    .map((a) => ({ id: a.id, maxCovers: a.max_covers }));
  const rows = (taken ?? []) as { area_id: string | null; date: string; time: string; party_size: number }[];

  const out: string[] = [];
  for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
    const date = addDays(p.today, i);
    const status = dayAvailability({
      date,
      today: p.today,
      enabled: true,
      maxDays: p.maxDays,
      slotMinutes: p.slotMinutes,
      hours: p.week,
      areas: areaRows,
      reservations: rows.filter((r) => r.date === date).map((r) => ({ areaId: r.area_id, time: String(r.time).slice(0, 5), partySize: r.party_size })),
      partySize: 2,
    });
    if (status.ok || status.reason === 'too_far') continue;
    out.push(`${DAY_SHORT[weekdayOfDate(date)]} ${date} (${status.reason === 'closed' ? 'cerrado' : 'lleno'})`);
  }
  return out;
}

type MenuCat = {
  name: string;
  entries?: { kind: string; name?: string; price?: number | null; is_hidden?: boolean; is_available?: boolean }[];
  subcategories?: MenuCat[];
};
type MenuLike = MenuCat[];

function flattenMenu(menu: MenuLike): { category: string; name: string; price: number | null; available: boolean }[] {
  const out: { category: string; name: string; price: number | null; available: boolean }[] = [];
  const walk = (cats: MenuLike, prefix: string) => {
    for (const cat of cats ?? []) {
      const label = prefix ? `${prefix} / ${cat.name}` : cat.name;
      for (const e of cat.entries ?? []) {
        if (e.kind !== 'product' || e.is_hidden || !e.name) continue;
        out.push({ category: label, name: e.name, price: e.price ?? null, available: e.is_available !== false });
      }
      walk(cat.subcategories ?? [], label);
    }
  };
  walk(menu, '');
  return out;
}
