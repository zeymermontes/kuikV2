'use server';

import { revalidatePath } from 'next/cache';
import { requireManager, requireOwner } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { seal, last4 } from '@/lib/crypto';
import type { ProviderId } from '@/lib/ai/types';

export async function saveWhatsappSettings(patch: {
  enabled?: boolean;
  bot_enabled?: boolean;
  ai_enabled?: boolean;
  away_enabled?: boolean;
  handoff_keywords?: string[];
  max_bot_replies_per_hour?: number;
  max_bot_replies_per_day?: number;
}): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase
    .from('whatsapp_settings')
    .upsert({ tenant_id: tenant.id, ...patch, updated_at: new Date().toISOString() },
            { onConflict: 'tenant_id' });
  revalidatePath('/whatsapp');
}

export async function saveCannedReply(key: string, body: string): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('whatsapp_canned_replies').upsert(
    { tenant_id: tenant.id, key, locale: 'es', body, enabled: true },
    { onConflict: 'tenant_id,key,locale' },
  );
  revalidatePath('/whatsapp');
}

/** Create or update one FAQ — the AI's local knowledge (consultar_info). */
export async function saveFaq(input: {
  id?: string;
  topic: string;
  answer: string;
  keywords: string;
  enabled: boolean;
}): Promise<{ ok: boolean; id?: string }> {
  const { tenant } = await requireManager();
  const supabase = await createClient();

  const row = {
    tenant_id: tenant.id,
    topic: input.topic.trim().slice(0, 60),
    answer: input.answer.trim().slice(0, 800),
    keywords: input.keywords.split(',').map((k) => k.trim()).filter(Boolean).slice(0, 15),
    enabled: input.enabled,
    updated_at: new Date().toISOString(),
  };
  if (!row.topic || !row.answer) return { ok: false };

  if (input.id) {
    const { error } = await supabase
      .from('whatsapp_faqs')
      .update(row)
      .eq('id', input.id)
      .eq('tenant_id', tenant.id);
    revalidatePath('/whatsapp');
    return { ok: !error, id: input.id };
  }
  const { data, error } = await supabase
    .from('whatsapp_faqs')
    .insert(row)
    .select('id')
    .single();
  revalidatePath('/whatsapp');
  return { ok: !error, id: (data as { id: string } | null)?.id };
}

export async function deleteFaq(id: string): Promise<void> {
  const { tenant } = await requireManager();
  const supabase = await createClient();
  await supabase.from('whatsapp_faqs').delete().eq('id', id).eq('tenant_id', tenant.id);
  revalidatePath('/whatsapp');
}

/**
 * Store the restaurant's own model key.
 *
 * Sealed before it touches the database and bound to this tenant, so it cannot
 * be read out of a dump or moved to another row. Only the last four characters
 * are ever readable afterwards — there is no "show key" and there should not be.
 */
export async function saveAiConfig(patch: {
  provider?: ProviderId;
  model?: string | null;
  use_own_key?: boolean;
  apiKey?: string | null;
  system_prompt_extra?: string | null;
  monthly_message_budget?: number | null;
}): Promise<void> {
  const { tenant } = await requireOwner();

  const update: Record<string, unknown> = {
    tenant_id: tenant.id,
    updated_at: new Date().toISOString(),
  };
  if (patch.provider) update.provider = patch.provider;
  if (patch.model !== undefined) update.model = patch.model;
  if (patch.use_own_key !== undefined) update.use_own_key = patch.use_own_key;
  if (patch.system_prompt_extra !== undefined) update.system_prompt_extra = patch.system_prompt_extra;
  if (patch.monthly_message_budget !== undefined) update.monthly_message_budget = patch.monthly_message_budget;

  if (patch.apiKey) {
    const sealed = seal(patch.apiKey, tenant.id);
    update.key_ct = `\\x${sealed.ct.toString('hex')}`;
    update.key_iv = `\\x${sealed.iv.toString('hex')}`;
    update.key_tag = `\\x${sealed.tag.toString('hex')}`;
    update.key_version = sealed.version;
    update.key_last4 = last4(patch.apiKey);
  } else if (patch.use_own_key === false) {
    update.key_ct = null;
    update.key_iv = null;
    update.key_tag = null;
    update.key_last4 = null;
  }

  // Service role: the key columns are deliberately never selected by the
  // dashboard, and writing them through the user's client would mean granting
  // that client read access to them too.
  const supabase = createAdminClient();
  await supabase.from('ai_providers_config').upsert(update, { onConflict: 'tenant_id' });
  revalidatePath('/whatsapp');
}
