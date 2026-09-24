'use server';

import { revalidatePath } from 'next/cache';
import { requireManager } from '@/lib/auth';
import {
  cloudSessionOf,
  localDrafts,
  removeTemplate,
  reviseTemplate,
  submitLocalDraft,
  submitTemplate,
  syncTemplates,
  type TemplateResult,
} from '@/lib/whatsapp/templates';
import type { MetaTemplateRow, TemplateDraft } from '@/lib/whatsapp/template-rules';

/**
 * The Meta templates manager. Every action resolves the tenant's live Cloud
 * API number and writes to THAT account — the same one the chat reads from
 * when it goes to send — so a template approved here is one the chat can use.
 */

export interface LocalDraftRow {
  name: string;
  language: string;
  category: string;
  body: string;
  variables: { index: number; key: string }[];
}

const NO_SESSION = 'no_official_session';

export async function listTemplatesAction(): Promise<TemplateResult<{ meta: MetaTemplateRow[]; drafts: LocalDraftRow[] }>> {
  const { tenant } = await requireManager();
  const session = await cloudSessionOf(tenant.id);
  if (!session) return { ok: false, error: NO_SESSION };
  const [meta, drafts] = await Promise.all([syncTemplates(session), localDrafts(tenant.id)]);
  if (!meta.ok) return meta;
  return { ok: true, data: { meta: meta.data, drafts } };
}

export async function createTemplateAction(draft: TemplateDraft): Promise<TemplateResult<{ id: string; status: string }>> {
  const { tenant } = await requireManager();
  const session = await cloudSessionOf(tenant.id);
  if (!session) return { ok: false, error: NO_SESSION };
  const r = await submitTemplate(session, draft);
  if (r.ok) revalidatePath('/whatsapp/templates');
  return r;
}

export async function editTemplateAction(template: { id: string; status: string }, draft: TemplateDraft): Promise<TemplateResult> {
  const { tenant } = await requireManager();
  const session = await cloudSessionOf(tenant.id);
  if (!session) return { ok: false, error: NO_SESSION };
  const r = await reviseTemplate(session, template, draft);
  if (r.ok) revalidatePath('/whatsapp/templates');
  return r;
}

export async function deleteTemplateAction(name: string, hsmId?: string): Promise<TemplateResult> {
  const { tenant } = await requireManager();
  const session = await cloudSessionOf(tenant.id);
  if (!session) return { ok: false, error: NO_SESSION };
  const r = await removeTemplate(session, name, hsmId);
  if (r.ok) revalidatePath('/whatsapp/templates');
  return r;
}

/** One of the seeded drafts (reserva_confirmada…) sent to Meta for review. */
export async function submitDraftAction(name: string, language: string): Promise<TemplateResult<{ id: string; status: string }>> {
  const { tenant } = await requireManager();
  const session = await cloudSessionOf(tenant.id);
  if (!session) return { ok: false, error: NO_SESSION };
  const r = await submitLocalDraft(session, name, language, tenant.name);
  if (r.ok) revalidatePath('/whatsapp/templates');
  return r;
}
