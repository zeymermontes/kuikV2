import { getTranslations } from 'next-intl/server';
import { requireManager } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
// The Cloud API path (WhatsappConnect) is built and kept, but hidden: it needs
// Meta business verification and Tech Provider status, which is weeks of
// paperwork. NEXT_PUBLIC_WHATSAPP_CLOUD=1 brings it back once that lands.
import { WhatsappConnect } from '@/components/dashboard/whatsapp/WhatsappConnect';
import { WhatsappPair } from '@/components/dashboard/whatsapp/WhatsappPair';
import { BotSettings } from '@/components/dashboard/whatsapp/BotSettings';
import { AiSettings } from '@/components/dashboard/whatsapp/AiSettings';

export const dynamic = 'force-dynamic';

export default async function WhatsappPage() {
  const { tenant, role } = await requireManager();
  const t = await getTranslations('whatsapp');
  const supabase = await createClient();

  const period = new Date();
  period.setUTCDate(1);

  const [{ data: numbers }, { data: settings }, { data: canned }, { data: goals }, { data: aiConfig }, { data: usage }] =
    await Promise.all([
      supabase.from('whatsapp_numbers').select('*').eq('tenant_id', tenant.id).order('created_at'),
      supabase.from('whatsapp_settings').select('*').eq('tenant_id', tenant.id).maybeSingle(),
      supabase.from('whatsapp_canned_replies').select('key, body').eq('tenant_id', tenant.id).eq('locale', 'es'),
      supabase.from('whatsapp_goals').select('*').eq('tenant_id', tenant.id).order('priority', { ascending: false }),
      // Deliberately NOT `select('*')`: the sealed key columns must never reach
      // a React tree, so the column list is explicit.
      supabase
        .from('ai_providers_config')
        .select('provider, model, use_own_key, key_last4, system_prompt_extra, monthly_message_budget')
        .eq('tenant_id', tenant.id)
        .maybeSingle(),
      supabase
        .from('ai_usage_counters')
        .select('messages')
        .eq('tenant_id', tenant.id)
        .eq('period', period.toISOString().slice(0, 10))
        .maybeSingle(),
    ]);

  const numberRows = (numbers ?? []) as (Parameters<typeof WhatsappConnect>[0]['numbers'][number] & { mode: string })[];
  const showCloudApi = process.env.NEXT_PUBLIC_WHATSAPP_CLOUD === '1';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="mb-1 text-2xl font-bold">{t('title')}</h1>
        <p className="text-sm text-neutral-500">{t('subtitle')}</p>
      </div>

      {showCloudApi ? (
        <WhatsappConnect numbers={numberRows} />
      ) : (
        <WhatsappPair numbers={numberRows} />
      )}

      <BotSettings
        settings={settings as Parameters<typeof BotSettings>[0]['settings']}
        canned={(canned ?? []) as { key: string; body: string }[]}
        goals={(goals ?? []) as Parameters<typeof BotSettings>[0]['goals']}
        hasNumber={numberRows.some((n) => n.status === 'connected')}
      />

      {/* AI keys are owner-only, matching the RLS on ai_providers_config. */}
      {role === 'owner' && (
        <AiSettings
          config={aiConfig as Parameters<typeof AiSettings>[0]['config']}
          usage={(usage as { messages: number } | null)?.messages ?? 0}
        />
      )}
    </div>
  );
}
