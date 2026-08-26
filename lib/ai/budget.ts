import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Spending limits, checked before a request and recorded after.
 *
 * The check is one indexed read against a monthly counter rather than a scan of
 * the run log — it sits on the hot path of every inbound message.
 */

export async function withinBudget(tenantId: string, ownKey: boolean): Promise<boolean> {
  // Someone paying with their own key isn't capped by us; the per-conversation
  // reply limits in bot.ts still protect the number's quality rating.
  if (ownKey) return true;

  const supabase = createAdminClient();
  const period = new Date();
  period.setUTCDate(1);
  const periodKey = period.toISOString().slice(0, 10);

  const [{ data: platform }, { data: usage }, { data: cfg }] = await Promise.all([
    supabase.from('platform_settings').select('ai_monthly_message_cap').maybeSingle(),
    supabase
      .from('ai_usage_counters')
      .select('messages, cost_usd')
      .eq('tenant_id', tenantId)
      .eq('period', periodKey)
      .maybeSingle(),
    supabase
      .from('ai_providers_config')
      .select('monthly_message_budget, monthly_cost_cap_usd')
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ]);

  const used = (usage as { messages: number; cost_usd: number } | null) ?? { messages: 0, cost_usd: 0 };
  const tenantCap = (cfg as { monthly_message_budget: number | null } | null)?.monthly_message_budget;
  const costCap = (cfg as { monthly_cost_cap_usd: number | null } | null)?.monthly_cost_cap_usd;
  const platformCap = (platform as { ai_monthly_message_cap?: number } | null)?.ai_monthly_message_cap ?? 3000;

  if (used.messages >= (tenantCap ?? platformCap)) return false;
  if (costCap != null && used.cost_usd >= costCap) return false;
  return true;
}

export async function recordUsage(
  tenantId: string,
  promptTokens: number,
  completionTokens: number,
  costUsd = 0,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.rpc('ai_usage_add', {
    p_tenant: tenantId,
    p_messages: 1,
    p_input: promptTokens,
    p_output: completionTokens,
    p_cost: costUsd,
  });
}
