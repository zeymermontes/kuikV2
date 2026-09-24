/**
 * Meta message templates: the rules, in one place, with no server imports.
 *
 * The builder in the dashboard validates as the owner types and draws the
 * preview; the server actions run the same validation once more before
 * calling Meta. Both read from here, so a rule is never true on one side and
 * false on the other. The checks mirror Meta's documented constraints so the
 * owner gets "no puede terminar con una variable" instead of a raw 2388299.
 */

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
/** Only static buttons: a URL with {{1}} would need a value on every send. */
export type TemplateButtonType = 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER';

export interface TemplateButton {
  type: TemplateButtonType;
  text: string;
  url?: string;
  phone?: string;
}

export interface TemplateDraft {
  name: string;
  category: TemplateCategory;
  language: string;
  /** Optional TEXT header ('' = none). */
  header: string;
  body: string;
  footer: string;
  /** "1", "2", … examples for the body's {{n}}; "header" for the header's {{1}}. */
  examples: Record<string, string>;
  buttons?: TemplateButton[];
}

export interface Issue {
  level: 'error' | 'warn';
  /** A key into the i18n namespace whatsapp.templates.issues. */
  key: string;
  /** Values for the message ({n}, {max}…). */
  values?: Record<string, string | number>;
}

/** One row as Meta returns it from GET {waba}/message_templates. */
export interface MetaTemplateRow {
  id: string;
  name: string;
  status: string;
  category: string;
  language: string;
  components?: MetaComponent[];
  rejected_reason?: string;
}

export interface MetaComponent {
  type: string;
  format?: string;
  text?: string;
  example?: unknown;
  buttons?: { type: string; text?: string; url?: string; phone_number?: string; example?: unknown }[];
}

/** What a template looks like once reduced to the parts a chat can draw and send. */
export interface TemplateParts {
  header: string;
  /** IMAGE | VIDEO | DOCUMENT | LOCATION when the header is not text. */
  mediaHeader: string | null;
  body: string;
  footer: string;
  buttons: TemplateButton[];
  /** URL with a variable, COPY_CODE, FLOW, OTP…: listed, not sendable from here. */
  unsupportedButtons: number;
}

/** What a sent template message carries in `whatsapp_messages.payload.template`. */
export interface WaTemplateMeta {
  name: string;
  lang: string;
  /** Values of the body's {{1}}, {{2}}… in order. */
  params: string[];
  headerParam?: string;
  /** Rendered header/footer and the static buttons, only so the bubble can be drawn. */
  header?: string | null;
  footer?: string | null;
  buttons?: TemplateButton[];
}

export const BODY_MAX = 1024;
export const HEADER_MAX = 60;
export const FOOTER_MAX = 60;
export const BUTTON_TEXT_MAX = 25;
export const BUTTONS_MAX = 10;
export const URL_BUTTONS_MAX = 2;
export const PHONE_BUTTONS_MAX = 1;
export const URL_MAX = 2000;
const NAME_RE = /^[a-z0-9_]{1,512}$/;
export const VAR_RE = /\{\{\s*(\d+)\s*\}\}/g;

export const TEMPLATE_LANGS = ['es_MX', 'es_ES', 'en_US', 'en_GB', 'pt_BR'] as const;
export const TEMPLATE_CATEGORIES: TemplateCategory[] = ['UTILITY', 'MARKETING'];
export const BUTTON_TYPES: TemplateButtonType[] = ['QUICK_REPLY', 'URL', 'PHONE_NUMBER'];

export const EMPTY_DRAFT: TemplateDraft = {
  name: '',
  category: 'UTILITY',
  language: 'es_MX',
  header: '',
  body: '',
  footer: '',
  examples: {},
  buttons: [],
};

/** Every {{n}} in order of appearance, repeats included. */
export function extractVars(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(VAR_RE)) out.push(Number(m[1]));
  return out;
}

/** The distinct {{n}} numbers, ascending. */
export function uniqueVars(text: string): number[] {
  return [...new Set(extractVars(text))].sort((a, b) => a - b);
}

/** Meta's name rules, applied as the owner types: lowercase, a-z 0-9 _. */
export function normalizeTemplateName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .slice(0, 512);
}

/** Meta ignores punctuation around a variable when deciding whether the body starts or ends with one. */
const EDGE_PUNCT = /^[\s.,;:!?¡¿()"'\-–—]+|[\s.,;:!?¡¿()"'\-–—]+$/g;

function edgesWithVariable(body: string): { starts: boolean; ends: boolean } {
  const t = body.replace(EDGE_PUNCT, '');
  return { starts: /^\{\{\s*\d+\s*\}\}/.test(t), ends: /\{\{\s*\d+\s*\}\}$/.test(t) };
}

export function validateTemplate(d: TemplateDraft): Issue[] {
  const issues: Issue[] = [];
  const err = (key: string, values?: Issue['values']) => issues.push({ level: 'error', key, values });

  // Name
  if (!d.name.trim()) err('nameRequired');
  else if (!NAME_RE.test(d.name)) err('nameChars');

  // Body
  const body = d.body;
  if (!body.trim()) err('bodyRequired');
  else {
    if (body.length > BODY_MAX) err('bodyTooLong', { max: BODY_MAX });
    const vars = uniqueVars(body);
    for (let i = 0; i < vars.length; i++) {
      if (vars[i] !== i + 1) {
        err('varsSequential', { n: vars[i], expected: i + 1 });
        break;
      }
    }
    for (const n of vars) {
      if (!(d.examples[String(n)] ?? '').trim()) err('exampleMissing', { n });
    }
    if (/\}\}\s*\{\{/.test(body)) err('varsAdjacent');
    if (vars.length > 0 && !body.replace(VAR_RE, '').replace(/[\s.,;:!?¡¿()"'\-–—]+/g, '').trim()) err('bodyOnlyVars');
    const edge = edgesWithVariable(body);
    if (edge.starts) err('bodyStartsWithVar');
    if (edge.ends) err('bodyEndsWithVar');
  }

  // Header (TEXT only)
  const header = d.header.trim();
  if (header) {
    if (header.length > HEADER_MAX) err('headerTooLong', { max: HEADER_MAX });
    const hv = extractVars(header);
    if (hv.length > 1) err('headerOneVar');
    else if (hv.length === 1) {
      if (hv[0] !== 1) err('headerVarMustBeOne');
      if (!(d.examples.header ?? '').trim()) err('headerExampleMissing');
    }
  }

  // Footer
  const footer = d.footer.trim();
  if (footer) {
    if (footer.length > FOOTER_MAX) err('footerTooLong', { max: FOOTER_MAX });
    if (extractVars(footer).length) err('footerNoVars');
  }

  // Buttons
  const buttons = d.buttons ?? [];
  if (buttons.length > BUTTONS_MAX) err('buttonsTooMany', { max: BUTTONS_MAX });
  if (buttons.filter((b) => b.type === 'URL').length > URL_BUTTONS_MAX) err('urlButtonsTooMany', { max: URL_BUTTONS_MAX });
  if (buttons.filter((b) => b.type === 'PHONE_NUMBER').length > PHONE_BUTTONS_MAX) err('phoneButtonsTooMany', { max: PHONE_BUTTONS_MAX });
  // Quick replies must be grouped together, not interleaved with URL/phone.
  const shape = buttons.map((b) => (b.type === 'QUICK_REPLY' ? 'q' : 'c')).join('');
  if (/qc+q|cq+c/.test(shape)) err('buttonsInterleaved');
  const seen = new Set<string>();
  buttons.forEach((b, i) => {
    const text = b.text.trim();
    const at = { i: i + 1 };
    if (!text) err('buttonTextRequired', at);
    else {
      if (text.length > BUTTON_TEXT_MAX) err('buttonTextTooLong', { ...at, max: BUTTON_TEXT_MAX });
      if (extractVars(text).length || /\n/.test(text)) err('buttonTextPlain', at);
      const k = text.toLowerCase();
      if (seen.has(k)) err('buttonTextDuplicate', at);
      seen.add(k);
    }
    if (b.type === 'URL') {
      const url = (b.url ?? '').trim();
      if (!/^https?:\/\/\S+\.\S+/.test(url)) err('buttonUrlInvalid', at);
      else if (url.length > URL_MAX) err('buttonUrlTooLong', { ...at, max: URL_MAX });
      if (extractVars(url).length) err('buttonUrlNoVars', at);
    }
    if (b.type === 'PHONE_NUMBER') {
      const digits = (b.phone ?? '').replace(/\D/g, '');
      if (digits.length < 8 || digits.length > 20) err('buttonPhoneInvalid', at);
    }
  });

  return issues;
}

/** The `components` array Meta expects on create and edit. */
export function buildComponents(d: TemplateDraft): Record<string, unknown>[] {
  const comps: Record<string, unknown>[] = [];
  const header = d.header.trim();
  if (header) {
    const h: Record<string, unknown> = { type: 'HEADER', format: 'TEXT', text: header };
    if (extractVars(header).length === 1) h.example = { header_text: [(d.examples.header ?? '').trim()] };
    comps.push(h);
  }
  const body: Record<string, unknown> = { type: 'BODY', text: d.body };
  const vars = uniqueVars(d.body);
  if (vars.length) body.example = { body_text: [vars.map((n) => (d.examples[String(n)] ?? '').trim())] };
  comps.push(body);
  const footer = d.footer.trim();
  if (footer) comps.push({ type: 'FOOTER', text: footer });
  const buttons = d.buttons ?? [];
  if (buttons.length) {
    comps.push({
      type: 'BUTTONS',
      buttons: buttons.map((b) =>
        b.type === 'URL'
          ? { type: 'URL', text: b.text.trim(), url: (b.url ?? '').trim() }
          : b.type === 'PHONE_NUMBER'
            ? { type: 'PHONE_NUMBER', text: b.text.trim(), phone_number: '+' + (b.phone ?? '').replace(/\D/g, '') }
            : { type: 'QUICK_REPLY', text: b.text.trim() },
      ),
    });
  }
  return comps;
}

/**
 * Meta's components, reduced to what a chat can draw and send. Accepts the
 * bare array Meta returns and the `{components: [...]}` wrapper the local
 * table stores.
 */
export function templateParts(input: unknown): TemplateParts {
  const comps = unwrapComponents(input);
  const parts: TemplateParts = { header: '', mediaHeader: null, body: '', footer: '', buttons: [], unsupportedButtons: 0 };
  for (const c of comps) {
    const type = (c.type ?? '').toUpperCase();
    if (type === 'HEADER') {
      const format = (c.format ?? 'TEXT').toUpperCase();
      if (format === 'TEXT') parts.header = c.text ?? '';
      else parts.mediaHeader = format;
    } else if (type === 'BODY') {
      parts.body = c.text ?? '';
    } else if (type === 'FOOTER') {
      parts.footer = c.text ?? '';
    } else if (type === 'BUTTONS') {
      for (const b of c.buttons ?? []) {
        const bt = (b.type ?? '').toUpperCase();
        if (bt === 'QUICK_REPLY') parts.buttons.push({ type: 'QUICK_REPLY', text: b.text ?? '' });
        else if (bt === 'PHONE_NUMBER') parts.buttons.push({ type: 'PHONE_NUMBER', text: b.text ?? '', phone: b.phone_number ?? '' });
        else if (bt === 'URL' && b.url && !extractVars(b.url).length) parts.buttons.push({ type: 'URL', text: b.text ?? '', url: b.url });
        else parts.unsupportedButtons++;
      }
    }
  }
  return parts;
}

export function unwrapComponents(input: unknown): MetaComponent[] {
  if (Array.isArray(input)) return input as MetaComponent[];
  if (input && typeof input === 'object' && Array.isArray((input as { components?: unknown }).components)) {
    return (input as { components: MetaComponent[] }).components;
  }
  return [];
}

/** A row from Meta, back into a draft the builder can edit. Examples come back empty: Meta does not return them. */
export function rowToDraft(row: MetaTemplateRow): TemplateDraft {
  const p = templateParts(row.components);
  const category: TemplateCategory = row.category === 'MARKETING' || row.category === 'AUTHENTICATION' ? row.category : 'UTILITY';
  return { name: row.name, category, language: row.language, header: p.header, body: p.body, footer: p.footer, examples: {}, buttons: p.buttons };
}

/** {{n}} replaced by its value (or left as-is when there is none). */
export function renderPreview(text: string, values: Record<string, string> | string[], headerVar = false): string {
  return text.replace(VAR_RE, (whole, n: string) => {
    const v = Array.isArray(values) ? values[Number(n) - 1] : headerVar ? values.header : values[n];
    return v && v.trim() ? v : whole;
  });
}

/** Rejected, paused and flagged templates can be resubmitted from here; an approved one is edited in Meta's manager. */
export function isEditableInApp(status: string): boolean {
  return ['REJECTED', 'PAUSED', 'FLAGGED'].includes(status.toUpperCase());
}

/** Meta's status → the local table's vocabulary. */
export function localStatus(metaStatus: string): 'pending' | 'approved' | 'rejected' | 'paused' | 'disabled' {
  switch (metaStatus.toUpperCase()) {
    case 'APPROVED': return 'approved';
    case 'REJECTED': return 'rejected';
    case 'PAUSED':
    case 'FLAGGED': return 'paused';
    case 'DISABLED': return 'disabled';
    default: return 'pending';
  }
}

export type StatusTone = 'green' | 'blue' | 'amber' | 'red' | 'gray';

export function statusTone(status: string): StatusTone {
  switch (status.toUpperCase()) {
    case 'APPROVED': return 'green';
    case 'PENDING':
    case 'IN_APPEAL': return 'blue';
    case 'PAUSED':
    case 'FLAGGED': return 'amber';
    case 'REJECTED': return 'red';
    default: return 'gray';
  }
}

/** An approved template as the chat's picker shows it. */
export interface WaTemplateOption {
  id: string;
  name: string;
  language: string;
  category: string;
  header: string | null;
  body: string;
  footer: string | null;
  /** Distinct body variables. */
  varCount: number;
  /** The header carries {{1}}. */
  headerVar: boolean;
  mediaHeader: string | null;
  buttons: TemplateButton[];
  /** Why it cannot be sent from here, when it cannot. */
  blocked: 'media-header' | 'buttons' | null;
}

export function toOption(row: MetaTemplateRow): WaTemplateOption {
  const p = templateParts(row.components);
  return {
    id: row.id,
    name: row.name,
    language: row.language,
    category: row.category,
    header: p.header || null,
    body: p.body,
    footer: p.footer || null,
    varCount: uniqueVars(p.body).length,
    headerVar: extractVars(p.header).length === 1,
    mediaHeader: p.mediaHeader,
    buttons: p.buttons,
    blocked: p.mediaHeader ? 'media-header' : p.unsupportedButtons ? 'buttons' : null,
  };
}

/**
 * Meta rejects parameters with newlines, tabs or more than four consecutive
 * spaces (132012). Cleaned here so the owner never sees that code.
 */
export function cleanParam(v: string): string {
  return v.replace(/[\r\n\t]+/g, ' ').replace(/ {5,}/g, '    ').trim();
}

/** The `template` object of a send: name, language, and only the components that carry values. */
export function sendTemplateObject(meta: Pick<WaTemplateMeta, 'name' | 'lang' | 'params' | 'headerParam'>): Record<string, unknown> {
  const components: Record<string, unknown>[] = [];
  if (meta.headerParam) components.push({ type: 'header', parameters: [{ type: 'text', text: meta.headerParam }] });
  if (meta.params.length) components.push({ type: 'body', parameters: meta.params.map((t) => ({ type: 'text', text: t })) });
  return { name: meta.name, language: { code: meta.lang }, ...(components.length ? { components } : {}) };
}

/**
 * Meta's send/creation errors that deserve a sentence for the owner rather
 * than the raw text. Matched by code or by Meta's own wording, since the
 * failure may arrive as a status webhook that carries only a title.
 */
export type ErrorHint = 'payment' | 'reengage' | 'marketingLimit' | 'nameMismatch' | 'params' | 'edgeVar';

export function errorHint(text: string): ErrorHint | null {
  const s = text.toLowerCase();
  if (s.includes('131042') || s.includes('payment issue') || s.includes('business eligibility')) return 'payment';
  if (s.includes('131047') || s.includes('re-engagement')) return 'reengage';
  if (s.includes('131049') || s.includes('healthy ecosystem')) return 'marketingLimit';
  if (s.includes('132001') || s.includes('does not exist in the translation')) return 'nameMismatch';
  if (s.includes('132012') || s.includes('132000') || s.includes('parameter format') || s.includes('number of parameters')) return 'params';
  if (s.includes('2388299')) return 'edgeVar';
  return null;
}

/**
 * Sample values for a blueprint's named variables, so a draft the seed left
 * behind (reserva_confirmada…) can be submitted without asking the owner
 * to invent examples for {{1}}…{{5}}.
 */
export function exampleFor(key: string, restaurant: string): string {
  switch (key) {
    case 'nombre': return 'Ana';
    case 'restaurante': return restaurant || 'Mi restaurante';
    case 'personas': return '4';
    case 'fecha': return '12 de octubre';
    case 'hora': return '20:00';
    case 'minutos': return '10';
    case 'mesa': return '7';
    default: return /^\d+$/.test(key) ? `valor ${key}` : key;
  }
}
