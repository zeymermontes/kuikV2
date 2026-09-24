import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getToken } from './credentials';
import {
  GraphApiError,
  createMessageTemplate,
  deleteMessageTemplate,
  editMessageTemplate,
  listMessageTemplates,
} from './client';
import {
  buildComponents,
  exampleFor,
  isEditableInApp,
  localStatus,
  templateParts,
  toOption,
  uniqueVars,
  validateTemplate,
  type MetaTemplateRow,
  type TemplateDraft,
  type WaTemplateOption,
} from './template-rules';

/**
 * Meta's templates, read live and mirrored into `whatsapp_templates`.
 *
 * The account on Meta is the truth: the manager lists from Graph every time.
 * The local table is the copy the send path and the reservation notifier
 * check ("is it approved?"), so every listing refreshes it, and the webhook's
 * status events keep it current between listings.
 */

export interface CloudSession {
  tenantId: string;
  wabaId: string;
  phoneNumberId: string;
  token: string;
}

export type TemplateResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** The tenant's live Cloud API number and its token, or null when there is none. */
export async function cloudSessionOf(tenantId: string): Promise<CloudSession | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('whatsapp_numbers')
    .select('waba_id, phone_number_id, is_default')
    .eq('tenant_id', tenantId)
    .in('mode', ['cloud_api', 'coexistence'])
    .eq('status', 'connected')
    .order('is_default', { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { waba_id: string | null; phone_number_id: string } | null;
  if (!row?.waba_id || !row.phone_number_id) return null;
  const token = await getToken(row.phone_number_id);
  if (!token) return null;
  return { tenantId, wabaId: row.waba_id, phoneNumberId: row.phone_number_id, token };
}

function errorText(err: unknown): string {
  if (err instanceof GraphApiError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

/** Positional variables for the local row: {{1}} → "1". Named keys are kept when the row already has them. */
function positionalVariables(components: unknown): { index: number; key: string }[] {
  return uniqueVars(templateParts(components).body).map((n) => ({ index: n, key: String(n) }));
}

/**
 * Meta's list, and the local table brought in line with it. Rows the account
 * no longer has (deleted in Meta's manager) are dropped locally unless they
 * are still drafts, which never went to Meta.
 */
export async function syncTemplates(session: CloudSession): Promise<TemplateResult<MetaTemplateRow[]>> {
  let rows: MetaTemplateRow[];
  try {
    rows = await listMessageTemplates<MetaTemplateRow>(session.wabaId, session.token);
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }

  const supabase = createAdminClient();
  const { data: local } = await supabase
    .from('whatsapp_templates')
    .select('id, name, language, status, variables')
    .eq('tenant_id', session.tenantId);
  const localRows = (local ?? []) as { id: string; name: string; language: string; status: string; variables: unknown }[];
  const byKey = new Map(localRows.map((r) => [`${r.name}|${r.language}`, r]));

  const now = new Date().toISOString();
  const upserts = rows.map((r) => {
    const existing = byKey.get(`${r.name}|${r.language}`);
    const keepVariables = existing && Array.isArray(existing.variables) && (existing.variables as unknown[]).length > 0;
    const status = localStatus(r.status);
    return {
      tenant_id: session.tenantId,
      waba_id: session.wabaId,
      name: r.name,
      language: r.language,
      category: ['UTILITY', 'MARKETING', 'AUTHENTICATION'].includes(r.category) ? r.category : 'UTILITY',
      status,
      meta_template_id: r.id,
      components: { components: r.components ?? [] },
      ...(keepVariables ? {} : { variables: positionalVariables(r.components) }),
      rejected_reason: r.rejected_reason ?? null,
      ...(status === 'approved' && (!existing || existing.status !== 'approved') ? { approved_at: now } : {}),
      updated_at: now,
    };
  });
  if (upserts.length) {
    await supabase.from('whatsapp_templates').upsert(upserts, { onConflict: 'tenant_id,name,language' });
  }
  const onMeta = new Set(rows.map((r) => `${r.name}|${r.language}`));
  const gone = localRows.filter((r) => r.status !== 'draft' && !onMeta.has(`${r.name}|${r.language}`)).map((r) => r.id);
  if (gone.length) await supabase.from('whatsapp_templates').delete().in('id', gone);

  return { ok: true, data: rows };
}

/** The approved templates a chat can send, freshly confirmed with Meta. */
export async function approvedTemplateOptions(session: CloudSession): Promise<TemplateResult<WaTemplateOption[]>> {
  const r = await syncTemplates(session);
  if (!r.ok) return r;
  return { ok: true, data: r.data.filter((row) => row.status === 'APPROVED').map(toOption) };
}

export async function submitTemplate(session: CloudSession, draft: TemplateDraft): Promise<TemplateResult<{ id: string; status: string }>> {
  const issues = validateTemplate(draft);
  if (issues.length) return { ok: false, error: `invalid:${issues[0].key}` };
  const components = buildComponents(draft);
  try {
    const res = await createMessageTemplate(session.wabaId, session.token, {
      name: draft.name,
      category: draft.category,
      language: draft.language,
      components,
    });
    const supabase = createAdminClient();
    await supabase.from('whatsapp_templates').upsert(
      {
        tenant_id: session.tenantId,
        waba_id: session.wabaId,
        name: draft.name,
        language: draft.language,
        category: res.category || draft.category,
        status: localStatus(res.status || 'PENDING'),
        meta_template_id: res.id,
        components: { components },
        variables: positionalVariables(components),
        rejected_reason: null,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'tenant_id,name,language' },
    );
    return { ok: true, data: { id: res.id, status: res.status } };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

export async function reviseTemplate(
  session: CloudSession,
  template: { id: string; status: string },
  draft: TemplateDraft,
): Promise<TemplateResult> {
  if (!isEditableInApp(template.status)) return { ok: false, error: 'not_editable' };
  const issues = validateTemplate(draft);
  if (issues.length) return { ok: false, error: `invalid:${issues[0].key}` };
  const components = buildComponents(draft);
  try {
    await editMessageTemplate(template.id, session.token, { category: draft.category, components });
    const supabase = createAdminClient();
    await supabase
      .from('whatsapp_templates')
      .update({
        status: 'pending',
        category: draft.category,
        components: { components },
        rejected_reason: null,
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', session.tenantId)
      .eq('name', draft.name)
      .eq('language', draft.language);
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

export async function removeTemplate(session: CloudSession, name: string, hsmId?: string): Promise<TemplateResult> {
  try {
    await deleteMessageTemplate(session.wabaId, session.token, name, hsmId);
    const supabase = createAdminClient();
    let q = supabase.from('whatsapp_templates').delete().eq('tenant_id', session.tenantId).eq('name', name);
    if (hsmId) q = q.eq('meta_template_id', hsmId);
    await q;
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: errorText(err) };
  }
}

/** The tenant's local drafts (the seeded blueprints, and anything Meta never saw). */
export async function localDrafts(tenantId: string): Promise<{ name: string; language: string; category: string; body: string; variables: { index: number; key: string }[] }[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('whatsapp_templates')
    .select('name, language, category, components, variables')
    .eq('tenant_id', tenantId)
    .eq('status', 'draft')
    .order('name');
  return ((data ?? []) as { name: string; language: string; category: string; components: unknown; variables: { index: number; key: string }[] }[]).map((r) => ({
    name: r.name,
    language: r.language,
    category: r.category,
    body: templateParts(r.components).body,
    variables: Array.isArray(r.variables) ? r.variables : [],
  }));
}

/**
 * A seeded draft, submitted to Meta with sample values for its named
 * variables. What the seed left as `draft` becomes a real pending template.
 */
export async function submitLocalDraft(session: CloudSession, name: string, language: string, restaurantName: string): Promise<TemplateResult<{ id: string; status: string }>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('whatsapp_templates')
    .select('category, components, variables')
    .eq('tenant_id', session.tenantId)
    .eq('name', name)
    .eq('language', language)
    .eq('status', 'draft')
    .maybeSingle();
  const row = data as { category: string; components: unknown; variables: { index: number; key: string }[] } | null;
  if (!row) return { ok: false, error: 'not_found' };
  const parts = templateParts(row.components);
  const examples: Record<string, string> = {};
  for (const v of Array.isArray(row.variables) ? row.variables : []) examples[String(v.index)] = exampleFor(v.key, restaurantName);
  for (const n of uniqueVars(parts.body)) examples[String(n)] ??= exampleFor(String(n), restaurantName);
  const draft: TemplateDraft = {
    name,
    language,
    category: row.category === 'MARKETING' ? 'MARKETING' : 'UTILITY',
    header: parts.header,
    body: parts.body,
    footer: parts.footer,
    examples: { ...examples, ...(parts.header ? { header: exampleFor('nombre', restaurantName) } : {}) },
    buttons: parts.buttons,
  };
  const res = await submitTemplate(session, draft);
  if (!res.ok) return res;
  // submitTemplate's upsert reset variables to positional; put the names back.
  await supabase
    .from('whatsapp_templates')
    .update({ variables: row.variables })
    .eq('tenant_id', session.tenantId)
    .eq('name', name)
    .eq('language', language);
  return res;
}
