import 'server-only';
import { z } from 'zod';
import { getMenu } from '@/lib/tenant';
import { createAdminClient } from '@/lib/supabase/admin';
import { formatPrice } from '@/lib/utils';
import { normalizeText } from '@/lib/whatsapp/parse';
import { botCreateReservation, botHandoff, CreateReservationInput, type BotContext } from '@/lib/whatsapp/actions';
import type { RenderVars } from '@/lib/whatsapp/render';
import type { ToolDef } from './types';

/**
 * Everything factual the model is allowed to say has to come through here.
 *
 * The security property that matters: `tenant_id` is NEVER a tool parameter. It
 * comes from the conversation, server-side. A prompt injection can therefore
 * make the model ask silly questions, but it cannot make it read another
 * restaurant's data.
 */

const SearchMenu = z.object({
  query: z.string().min(1).max(60).describe('Palabra a buscar, p. ej. "camarones"'),
});

const Empty = z.object({});

const Handoff = z.object({
  motivo: z.string().max(200).optional(),
});

/** The booking fields, reused by both the reply schema and the create action. */
const BookingFields = z.object({
  party_size: z.number().int().min(1).max(50).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
    .describe('Fecha completa YYYY-MM-DD. Si el cliente fue ambiguo, pregunta antes de anotar.'),
  time: z.string().regex(/^\d{2}:\d{2}$/).optional()
    .describe('Hora en formato 24h HH:MM.'),
  customer_name: z.string().min(2).max(80).optional(),
  area: z.string().max(60).optional(),
  note: z.string().max(300).optional(),
});

/** One Zod schema, used for the declaration AND to validate what comes back. */
function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema) as Record<string, unknown>;
}

/**
 * Every reply during a booking comes back through here.
 *
 * The earlier design offered an optional `anotar_datos` tool and hoped the model
 * would call it. Measured against the real provider, it often did not — it
 * would answer in plain text and save everything at the very end, so a long
 * conversation could lose facts once the history window truncated.
 *
 * Making the reply itself structured removes the choice: `datos` travels with
 * every message, and there is no path where the model speaks without also
 * reporting what it now knows.
 */
const Reply = z.object({
  mensaje: z.string().min(1).max(900)
    .describe('El texto que se le manda al cliente por WhatsApp.'),
  datos: BookingFields.optional()
    .describe('TODOS los datos confirmados hasta ahora, no solo los de este turno. Omite los que sigan sin confirmar.'),
});

export const TOOL_SCHEMAS = {
  responder: Reply,
  buscar_menu: SearchMenu,
  consultar_horarios: Empty,
  consultar_ubicacion: Empty,
  enviar_menu: Empty,
  crear_reserva: CreateReservationInput,
  pasar_con_humano: Handoff,
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

/**
 * @param collecting - true while the model is running a booking conversation,
 *   which is the only time it should be writing partial state down.
 */
export function toolDefinitions(collecting = false): ToolDef[] {
  const base: ToolDef[] = [
    {
      name: 'buscar_menu',
      description:
        'Busca platillos en el menú real del restaurante. ÚSALA SIEMPRE antes de hablar de precios o disponibilidad de un platillo.',
      parameters: toJsonSchema(SearchMenu),
    },
    {
      name: 'consultar_horarios',
      description: 'Devuelve el horario real del restaurante.',
      parameters: toJsonSchema(Empty),
    },
    {
      name: 'consultar_ubicacion',
      description: 'Devuelve la dirección y el enlace de mapa del restaurante.',
      parameters: toJsonSchema(Empty),
    },
    {
      name: 'enviar_menu',
      description: 'Devuelve el enlace al menú digital.',
      parameters: toJsonSchema(Empty),
    },
    {
      name: 'crear_reserva',
      description:
        'Registra una solicitud de reservación. Pide TODOS los datos antes de llamarla y confirma con el cliente.',
      parameters: toJsonSchema(CreateReservationInput),
    },
    {
      name: 'pasar_con_humano',
      description: 'Deja de responder y avisa a una persona del restaurante.',
      parameters: toJsonSchema(Handoff),
    },
  ];

  if (collecting) {
    base.unshift({
      name: 'responder',
      description:
        'SIEMPRE termina tu turno llamando a esta herramienta. Es la única forma de ' +
        'hablarle al cliente. En `datos` repite TODOS los datos que ya confirmaste, ' +
        'incluidos los de turnos anteriores. NUNCA pongas ahí algo ambiguo: si dijo ' +
        '"el 30" y no sabes el mes, deja `date` fuera y pregúntalo en el mensaje.',
      parameters: toJsonSchema(Reply),
    });
  }

  return base;
}

export interface ToolOutcome {
  /** What goes back to the model. */
  content: string;
  /**
   * Every number this result legitimately contains. The guard compares the
   * model's reply against these, so anything it invents can be caught.
   */
  facts: string[];
}

export async function runTool(
  name: string,
  rawArgs: Record<string, unknown>,
  ctx: BotContext,
  vars: RenderVars,
): Promise<ToolOutcome> {
  const schema = TOOL_SCHEMAS[name as ToolName];
  if (!schema) return { content: 'Herramienta desconocida.', facts: [] };

  const parsed = schema.safeParse(rawArgs);
  if (!parsed.success) {
    // Hand the model its own mistake rather than throwing: it can correct and
    // retry within the same turn.
    return { content: `Argumentos inválidos: ${parsed.error.message.slice(0, 200)}`, facts: [] };
  }

  switch (name) {
    case 'buscar_menu': {
      const { query } = parsed.data as z.infer<typeof SearchMenu>;
      const menu = await getMenu(ctx.tenantId, ctx.branchId);
      const q = normalizeText(query);
      const hits: { nombre: string; precio: number | null; disponible: boolean }[] = [];

      // A category holds `entries` (products and separators interleaved) plus
      // nested subcategories, so walk both.
      const walk = (categories: typeof menu): void => {
        for (const category of categories) {
          for (const entry of category.entries ?? []) {
            if (entry.kind !== 'product' || hits.length >= 15) continue;
            const haystack = normalizeText(`${entry.name} ${entry.description ?? ''}`);
            if (!haystack.includes(q)) continue;
            // Hidden products are not on the menu the diner can see.
            if (entry.is_hidden) continue;
            hits.push({ nombre: entry.name, precio: entry.price, disponible: entry.is_available });
          }
          walk(category.subcategories ?? []);
        }
      };
      walk(menu);

      if (hits.length === 0) {
        return { content: `No encontré nada como "${query}" en el menú.`, facts: [] };
      }

      const facts = hits.flatMap((h) => (h.precio != null ? [String(h.precio)] : []));
      const lines = hits.map(
        (h) =>
          `- ${h.nombre}${h.precio != null ? ` — ${formatPrice(h.precio)}` : ''}` +
          `${h.disponible ? '' : ' (no disponible hoy)'}`,
      );
      return { content: lines.join('\n'), facts };
    }

    case 'consultar_horarios':
      return {
        content: vars.horario_semana || vars.horario_hoy || 'No tengo el horario configurado.',
        facts: extractNumbers(`${vars.horario_semana ?? ''} ${vars.horario_hoy ?? ''}`),
      };

    case 'consultar_ubicacion':
      return {
        content: [vars.direccion, vars.mapa].filter(Boolean).join('\n') || 'No tengo la dirección configurada.',
        facts: extractNumbers(vars.direccion ?? ''),
      };

    case 'enviar_menu':
      return { content: vars.menu_url || 'No tengo el menú configurado.', facts: [] };

    case 'crear_reserva': {
      const args = parsed.data as z.infer<typeof CreateReservationInput>;
      const result = await botCreateReservation(ctx, args);

      if (result.ok) {
        // The booking is done, so the conversation must leave booking mode —
        // otherwise the next "gracias" is read as another answer to a question
        // that no longer exists.
        await createAdminClient()
          .from('whatsapp_conversations')
          .update({ active_goal_id: null, state: {} })
          .eq('id', ctx.conversationId);
      }

      return {
        content: result.ok
          ? 'Reservación registrada como solicitud pendiente de confirmación.'
          : `No se pudo registrar: ${result.message}. Explícaselo al cliente y ofrece otra opción.`,
        facts: [String(args.party_size)],
      };
    }

    case 'pasar_con_humano': {
      const { motivo } = parsed.data as z.infer<typeof Handoff>;
      await botHandoff(ctx, motivo ? 'ai' : 'ai');
      return { content: 'Listo, avisé a una persona del restaurante.', facts: [] };
    }

    default:
      return { content: 'Herramienta desconocida.', facts: [] };
  }
}

function extractNumbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(',', '.'));
}

/**
 * Save the facts a structured reply reported.
 *
 * The model sends the FULL set each turn, not a delta, so this replaces rather
 * than merges: that is what lets a diner correct themselves ("mejor 6") without
 * the old value lingering underneath.
 */
export async function persistBookingState(
  conversationId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const clean = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
  const supabase = createAdminClient();
  await supabase
    .from('whatsapp_conversations')
    .update({ state: { values: clean }, updated_at: new Date().toISOString() })
    .eq('id', conversationId);
}
