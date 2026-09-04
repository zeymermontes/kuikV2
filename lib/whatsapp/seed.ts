import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { FLOW_TEMPLATES, type FlowTemplate } from './flows/templates';

/**
 * What a restaurant gets the moment it connects a number.
 *
 * A bot that starts blank is a bot nobody configures, so this seeds a working
 * set: an out-of-hours message, a numbered menu, and enough goals to answer the
 * three things every restaurant is asked — can I book, what time do you open,
 * where are you.
 *
 * Everything is `on conflict do nothing`, so reconnecting a number never
 * overwrites what the restaurant has since edited.
 */

const CANNED: { key: string; body: string }[] = [
  {
    key: 'greeting',
    body: '¡Hola! Soy el asistente de {{restaurante}} 👋\n¿En qué te puedo ayudar?',
  },
  {
    key: 'away',
    body: 'Ahorita estamos cerrados 🌙 Nuestro horario de hoy es {{horario_hoy}}.\nSi quieres, dime qué necesitas y lo dejamos listo.',
  },
  {
    key: 'fallback',
    body: 'No estoy seguro de haber entendido 🤔 ¿Te ayudo con alguna de estas?',
  },
  {
    key: 'handoff',
    body: 'Claro, en un momento te atiende una persona del restaurante 🙋',
  },
  {
    key: 'optout_ack',
    body: 'Listo, no volveré a escribirte por aquí. Si cambias de opinión, mándanos un mensaje cuando quieras.',
  },
  {
    key: 'reservation_ok',
    body: '¡Listo! Dejé tu solicitud registrada 📝 El restaurante te confirma en unos minutos.',
  },
];

// The conversational defaults live in lib/whatsapp/flows/templates.ts as
// published graphs — the same five things every restaurant is asked, now
// editable on the canvas.

/**
 * Insert templates as ALREADY-PUBLISHED flows (version 1), skipping any key
 * the tenant has — so re-pairing never clobbers an edited flow. Exported for
 * the one-shot goal backfill, which feeds converted goals through the same
 * door.
 */
export async function seedFlows(
  supabase: ReturnType<typeof createAdminClient>,
  tenantId: string,
  templates: (FlowTemplate & { enabled?: boolean })[],
): Promise<void> {
  const { data: existing } = await supabase
    .from('whatsapp_flows')
    .select('key')
    .eq('tenant_id', tenantId);
  const have = new Set(((existing ?? []) as { key: string }[]).map((r) => r.key));

  for (const t of templates) {
    if (have.has(t.key)) continue;
    // Insert as a DRAFT first and flip published_version only after the
    // snapshot lands: a failure in between leaves an unpublished draft the
    // owner can publish from the canvas, never a flow pointing at a missing
    // version (which would end every run as graph_missing).
    const { data: flow } = await supabase
      .from('whatsapp_flows')
      .insert({
        tenant_id: tenantId,
        key: t.key,
        name: t.name,
        description: t.description,
        enabled: t.enabled ?? true,
        priority: t.priority,
        triggers: t.triggers,
        mode: t.mode,
        draft_graph: t.graph,
        published_version: 0,
        nudge_after_minutes: t.nudge_after_minutes,
        max_nudges: t.max_nudges,
        nudge_message: t.nudge_message,
        close_after_minutes: t.close_after_minutes,
        close_message: t.close_message,
      })
      .select('id')
      .single();
    if (!flow) continue;
    const flowId = (flow as { id: string }).id;
    const { error: verError } = await supabase.from('whatsapp_flow_versions').insert({
      flow_id: flowId,
      tenant_id: tenantId,
      version: 1,
      graph: t.graph,
    });
    if (verError) continue;
    await supabase.from('whatsapp_flows').update({ published_version: 1 }).eq('id', flowId);
  }
}

export async function seedDefaults(tenantId: string, wabaId: string): Promise<void> {
  const supabase = createAdminClient();

  // On, because connecting a number IS the act of asking for this. Seeding
  // with the table's defaults left everything switched off: the dashboard said
  // "Connected", a diner wrote, and nothing happened — with three toggles
  // elsewhere as the only explanation.
  //
  // ignoreDuplicates means this only applies to a brand-new row, so someone who
  // deliberately turned it off stays off when they re-pair.
  //
  // AI is NOT turned on here: it spends money and needs a key.
  await supabase.from('whatsapp_settings').upsert(
    { tenant_id: tenantId, enabled: true, bot_enabled: true },
    { onConflict: 'tenant_id', ignoreDuplicates: true },
  );

  await supabase.from('whatsapp_canned_replies').upsert(
    CANNED.map((c, i) => ({ tenant_id: tenantId, locale: 'es', position: i, ...c })),
    { onConflict: 'tenant_id,key,locale', ignoreDuplicates: true },
  );

  await seedFlows(supabase, tenantId, FLOW_TEMPLATES);

  // Clone Kuik's template blueprints into this tenant's own account. Under
  // Coexistence every restaurant has its own WABA, so approval happens once
  // PER TENANT — there is no shared template to inherit.
  const { data: blueprints } = await supabase
    .from('whatsapp_templates')
    .select('name, language, category, components, variables')
    .is('tenant_id', null);

  if (blueprints && blueprints.length > 0) {
    await supabase.from('whatsapp_templates').upsert(
      (blueprints as Record<string, unknown>[]).map((b) => ({
        ...b,
        tenant_id: tenantId,
        waba_id: wabaId,
        status: 'draft',
      })),
      { onConflict: 'tenant_id,name,language', ignoreDuplicates: true },
    );
  }
}
