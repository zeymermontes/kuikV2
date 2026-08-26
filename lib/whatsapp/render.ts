/**
 * `{{variable}}` substitution for canned replies, flow prompts and template
 * values. One implementation, so a restaurant learns the placeholders once.
 *
 * Pure: the caller assembles the facts, which keeps this testable and stops a
 * message render from quietly doing database work.
 */

export interface RenderVars {
  restaurante?: string;
  horario_hoy?: string;
  horario_semana?: string;
  direccion?: string;
  mapa?: string;
  menu_url?: string;
  telefono?: string;
  opciones?: string;
  [key: string]: string | undefined;
}

export function renderTemplate(body: string, vars: RenderVars): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => vars[key] ?? '');
}

/** The placeholders offered in the dashboard's insert palette. */
export const RENDER_VARIABLES = [
  'restaurante', 'horario_hoy', 'horario_semana', 'direccion',
  'mapa', 'menu_url', 'telefono', 'opciones',
] as const;
