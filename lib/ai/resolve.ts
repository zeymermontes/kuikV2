import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { open, CURRENT_KEY_VERSION } from '@/lib/crypto';
import { REGISTRY } from './registry';
import type { ProviderId } from './types';

/**
 * Which model answers, and on whose bill.
 *
 * Kuik supplies a default key; a restaurant may bring its own. That difference
 * decides more than billing: cost caps apply ONLY when Kuik is paying. Someone
 * spending their own money still gets abuse limits — they protect the number's
 * quality rating — but not a spending ceiling Kuik has no business imposing.
 */

export interface ResolvedProvider {
  id: ProviderId;
  model: string;
  apiKey: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
  systemExtra: string | null;
  /** True when the tenant pays. Cost caps only apply when false. */
  ownKey: boolean;
}

function bytea(v: unknown): Buffer {
  const s = String(v ?? '');
  return Buffer.from(s.startsWith('\\x') ? s.slice(2) : s, 'hex');
}

export async function resolveProvider(tenantId: string): Promise<ResolvedProvider | null> {
  const supabase = createAdminClient();

  const [{ data: platform }, { data: cfgRow }] = await Promise.all([
    supabase.from('platform_settings').select('ai_enabled, ai_default_provider, ai_default_model').maybeSingle(),
    supabase.from('ai_providers_config').select('*').eq('tenant_id', tenantId).maybeSingle(),
  ]);

  // A super admin can switch every tenant's AI off without a deploy.
  if ((platform as { ai_enabled?: boolean } | null)?.ai_enabled === false) return null;

  const cfg = cfgRow as {
    provider: ProviderId; model: string | null; use_own_key: boolean;
    key_ct: unknown; key_iv: unknown; key_tag: unknown; key_version: number | null;
    base_url: string | null; temperature: number; max_output_tokens: number;
    system_prompt_extra: string | null;
  } | null;

  const id = (cfg?.provider ??
    (platform as { ai_default_provider?: ProviderId } | null)?.ai_default_provider ??
    'deepseek') as ProviderId;
  const entry = REGISTRY[id];
  if (!entry) return null;

  let apiKey: string | null = null;
  let ownKey = false;

  if (cfg?.use_own_key && cfg.key_ct) {
    try {
      apiKey = open(
        {
          ct: bytea(cfg.key_ct),
          iv: bytea(cfg.key_iv),
          tag: bytea(cfg.key_tag),
          version: cfg.key_version ?? CURRENT_KEY_VERSION,
        },
        tenantId,
      );
      ownKey = true;
    } catch {
      // Unreadable key: fall through to Kuik's rather than failing the chat.
      apiKey = null;
    }
  }

  if (!apiKey) apiKey = process.env[entry.envKey] ?? null;
  if (!apiKey) return null;

  return {
    id,
    // Three levels, most specific first: what this restaurant chose, what the
    // super admin set for everyone, then the code's own fallback.
    model:
      cfg?.model ||
      (platform as { ai_default_model?: string | null } | null)?.ai_default_model ||
      entry.defaultModel,
    apiKey,
    baseUrl: cfg?.base_url ?? undefined,
    temperature: cfg?.temperature ?? 0.2,
    maxTokens: cfg?.max_output_tokens ?? 400,
    systemExtra: cfg?.system_prompt_extra ?? null,
    ownKey,
  };
}
