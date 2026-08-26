import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

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

const GOALS = [
  {
    key: 'reservation',
    name: 'Reservar mesa',
    description: 'Reservar una mesa o un salón privado.',
    priority: 100,
    resolver: 'flow',
    action: 'create_reservation',
    triggers: [
      { kind: 'keyword', value: 'reservar' },
      { kind: 'keyword', value: 'reservacion' },
      { kind: 'keyword', value: 'reserva' },
      { kind: 'keyword', value: 'mesa' },
      { kind: 'keyword', value: 'apartar' },
    ],
    flow: {
      slots: [
        { key: 'party_size', type: 'number', min: 1, max: 50, prompt: '¿Para cuántas personas? 🍽️' },
        { key: 'date', type: 'date', prompt: '¿Qué día te gustaría venir?' },
        { key: 'time', type: 'time', prompt: '¿A qué hora?' },
        { key: 'customer_name', type: 'text', prompt: '¿A nombre de quién la dejo?' },
      ],
      confirm: {
        body: 'Confirmo: {{party_size}} personas el {{date}} a las {{time}}, a nombre de {{customer_name}}. ¿Está bien?',
      },
      onConfirm: 'create_reservation',
      onCancel: 'Sin problema 👍 ¿Te ayudo con algo más?',
    },
  },
  {
    key: 'hours',
    name: 'Horarios',
    description: 'Consultar a qué hora abre y cierra el restaurante.',
    priority: 80,
    resolver: 'reply',
    reply_body: 'Nuestro horario es:\n{{horario_semana}}',
    triggers: [
      { kind: 'keyword', value: 'horario' },
      { kind: 'keyword', value: 'horarios' },
      { kind: 'keyword', value: 'abren' },
      { kind: 'keyword', value: 'cierran' },
      { kind: 'keyword', value: 'abierto' },
    ],
  },
  {
    key: 'menu',
    name: 'Ver el menú',
    // Note the deliberate choice: with AI off, the right answer to "how much is
    // the salmon?" is the menu link, not a quoted price. Quoting needs a product
    // lookup, which is what the AI's buscar_menu tool is for.
    description: 'Ver el menú y los precios.',
    priority: 70,
    resolver: 'reply',
    reply_body: 'Aquí está nuestro menú completo con precios 📖\n{{menu_url}}',
    triggers: [
      { kind: 'keyword', value: 'menu' },
      { kind: 'keyword', value: 'carta' },
      { kind: 'keyword', value: 'precio' },
      { kind: 'keyword', value: 'precios' },
      { kind: 'keyword', value: 'cuesta' },
      { kind: 'keyword', value: 'cuanto' },
    ],
  },
  {
    key: 'location',
    name: 'Cómo llegar',
    description: 'Consultar la dirección y cómo llegar.',
    priority: 60,
    resolver: 'reply',
    reply_body: 'Estamos en {{direccion}} 📍\n{{mapa}}',
    triggers: [
      { kind: 'keyword', value: 'direccion' },
      { kind: 'keyword', value: 'ubicacion' },
      { kind: 'keyword', value: 'donde' },
      { kind: 'keyword', value: 'llegar' },
      { kind: 'keyword', value: 'mapa' },
    ],
  },
  {
    key: 'human',
    name: 'Hablar con alguien',
    description: 'Pasar la conversación a una persona del restaurante.',
    priority: 10,
    resolver: 'reply',
    reply_body: 'Claro, en un momento te atiende una persona 🙋',
    action: 'handoff',
    triggers: [
      { kind: 'keyword', value: 'humano' },
      { kind: 'keyword', value: 'persona' },
      { kind: 'keyword', value: 'agente' },
    ],
  },
];

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

  await supabase.from('whatsapp_goals').upsert(
    GOALS.map((g) => ({ tenant_id: tenantId, ...g })),
    { onConflict: 'tenant_id,key', ignoreDuplicates: true },
  );

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
