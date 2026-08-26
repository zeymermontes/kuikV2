'use client';

import { useState, useTransition } from 'react';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Card, Input, Label, Textarea, Button } from '@/components/ui';
import { saveAiConfig } from '@/app/(dashboard)/whatsapp/actions';
import type { ProviderId } from '@/lib/ai/types';

const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openai', label: 'ChatGPT (OpenAI)' },
  { id: 'gemini', label: 'Gemini (Google)' },
  { id: 'anthropic', label: 'Claude (Anthropic)' },
  { id: 'kimi', label: 'Kimi (Moonshot)' },
];

interface Config {
  provider: ProviderId;
  model: string | null;
  use_own_key: boolean;
  key_last4: string | null;
  system_prompt_extra: string | null;
  monthly_message_budget: number | null;
}

/**
 * The key is write-only by design: the dashboard never selects the ciphertext,
 * so there is no "reveal" and cannot be one. Only the last four characters come
 * back, which is enough to recognise which key is stored.
 */
export function AiSettings({
  config,
  usage,
  lastFailure,
}: {
  config: Config | null;
  usage: number;
  /** Most recent run that could not answer, so the reason is visible here. */
  lastFailure: { outcome: string; error: string | null; created_at: string } | null;
}) {
  const t = useTranslations('whatsapp');
  const [cfg, setCfg] = useState<Config>(
    config ?? {
      provider: 'deepseek', model: null, use_own_key: false,
      key_last4: null, system_prompt_extra: null, monthly_message_budget: null,
    },
  );
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [, start] = useTransition();

  function patch(next: Partial<Config>) {
    setCfg((cur) => ({ ...cur, ...next }));
    start(async () => saveAiConfig(next));
  }

  function saveKey() {
    if (!apiKey.trim()) return;
    const key = apiKey.trim();
    setApiKey('');
    setCfg((cur) => ({ ...cur, use_own_key: true, key_last4: key.slice(-4) }));
    setSaved(true);
    start(async () => saveAiConfig({ use_own_key: true, apiKey: key }));
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4" /> {t('aiTitle')}
        </h2>
        <p className="text-sm text-neutral-500">{t('aiHint')}</p>
      </div>

      <div>
        <Label htmlFor="ai-provider">{t('field_provider')}</Label>
        <select
          id="ai-provider"
          value={cfg.provider}
          onChange={(e) => patch({ provider: e.target.value as ProviderId })}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="rounded-lg border border-neutral-200 p-3">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-sm font-medium">{t('field_ownKey')}</span>
            <p className="text-xs text-neutral-500">
              {cfg.use_own_key && cfg.key_last4
                ? t('keyStored', { last4: cfg.key_last4 })
                : t('hint_kuikKey')}
            </p>
          </div>
          {cfg.use_own_key && (
            <button
              onClick={() => {
                // Clears the stored key server-side as well as the flag.
                setCfg((cur) => ({ ...cur, use_own_key: false, key_last4: null }));
                start(async () => saveAiConfig({ use_own_key: false, apiKey: null }));
              }}
              className="text-xs text-neutral-500 underline"
            >
              {t('useKuikKey')}
            </button>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            type="password"
            placeholder={t('field_apiKey')}
            value={apiKey}
            onChange={(e) => { setApiKey(e.target.value); setSaved(false); }}
            className="flex-1"
            autoComplete="off"
          />
          <Button variant="secondary" onClick={saveKey} disabled={!apiKey.trim()}>
            {saved ? t('saved') : t('save')}
          </Button>
        </div>
      </div>

      <div>
        <Label htmlFor="ai-tone">{t('field_tone')}</Label>
        <Textarea
          id="ai-tone"
          rows={3}
          defaultValue={cfg.system_prompt_extra ?? ''}
          placeholder={t('tonePlaceholder')}
          onBlur={(e) => patch({ system_prompt_extra: e.target.value || null })}
        />
      </div>

      {!cfg.use_own_key && (
        <div>
          <Label htmlFor="ai-budget">{t('field_budget')}</Label>
          <Input
            id="ai-budget"
            type="number"
            min={0}
            defaultValue={cfg.monthly_message_budget ?? ''}
            onBlur={(e) => patch({ monthly_message_budget: e.target.value ? Number(e.target.value) : null })}
          />
          <p className="mt-1 text-xs text-neutral-500">{t('usageThisMonth', { count: usage })}</p>
        </div>
      )}

      {lastFailure && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" /> {t('aiLastFailure')}
          </p>
          <p className="mt-0.5">{lastFailure.error ?? lastFailure.outcome}</p>
        </div>
      )}

      <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">{t('aiFallbackNote')}</p>
    </Card>
  );
}
