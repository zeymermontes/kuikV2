'use client';

import { useState, useTransition } from 'react';
import { Sparkles, KeyRound, AlertTriangle } from 'lucide-react';
import { Card, Input, Label } from '@/components/ui';
import { updateAiPlatform, type TenantAiUsage } from '@/app/(dashboard)/admin/actions';

/**
 * `models` are suggestions, not a closed list — providers retire and rename
 * them constantly, so the field stays free text and these just fill the
 * dropdown. The first entry of each is the cheap workhorse.
 */
const PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek', env: 'AI_DEEPSEEK_KEY',
    models: ['deepseek-chat', 'deepseek-v4-flash', 'deepseek-v4-pro'],
    // v4 models reason before answering, spending output budget on thinking.
    reasoning: ['deepseek-v4-flash', 'deepseek-v4-pro'] },
  { id: 'openai', label: 'ChatGPT (OpenAI)', env: 'AI_OPENAI_KEY',
    models: ['gpt-4o-mini', 'gpt-4o'], reasoning: [] },
  { id: 'gemini', label: 'Gemini (Google)', env: 'AI_GEMINI_KEY',
    models: ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-pro'], reasoning: [] },
  { id: 'anthropic', label: 'Claude (Anthropic)', env: 'AI_ANTHROPIC_KEY',
    models: ['claude-haiku-4-5', 'claude-sonnet-4-5'], reasoning: [] },
  { id: 'kimi', label: 'Kimi (Moonshot)', env: 'AI_KIMI_KEY',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k'], reasoning: [] },
];

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-neutral-900' : 'bg-neutral-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
    </button>
  );
}

/**
 * Platform-wide AI controls, for the super admin.
 *
 * The provider keys themselves are NOT editable here — they live in env vars,
 * so a database dump can never contain them. This page decides which provider
 * is used by default and how much a restaurant may spend on Kuik's key before
 * the bot quietly falls back to its scripted flows.
 */
export function AiPlatformSettings({
  settings,
  usage,
  configuredProviders,
}: {
  settings: {
    ai_enabled: boolean;
    whatsapp_enabled: boolean;
    ai_default_provider: string;
    ai_default_model: string | null;
    ai_monthly_message_cap: number;
  };
  usage: TenantAiUsage[];
  /** Which provider env vars are actually set, so a broken default is visible. */
  configuredProviders: string[];
}) {
  const [s, setS] = useState(settings);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function save(next: typeof s) {
    setS(next);
    setSaved(false);
    start(async () => {
      await updateAiPlatform({
        aiEnabled: next.ai_enabled,
        whatsappEnabled: next.whatsapp_enabled,
        defaultProvider: next.ai_default_provider,
        defaultModel: next.ai_default_model,
        monthlyMessageCap: next.ai_monthly_message_cap,
      });
      setSaved(true);
    });
  }

  const defaultConfigured = configuredProviders.includes(s.ai_default_provider);
  const provider = PROVIDERS.find((p) => p.id === s.ai_default_provider);
  const suggested = provider?.models ?? [];
  const isReasoning = (provider?.reasoning ?? []).includes(s.ai_default_model ?? '');
  const billable = usage.filter((u) => !u.ownKey);
  const billableMessages = billable.reduce((n, u) => n + u.messages, 0);

  return (
    <Card className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4" /> IA y WhatsApp (plataforma)
        </h2>
        <p className="text-sm text-neutral-500">
          Aplica a todos los restaurantes. Cada uno puede tener su propia llave.
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium">IA activa</span>
          <p className="text-xs text-neutral-500">
            Apagarlo detiene la IA de todos al instante; los bots siguen con sus flujos.
          </p>
        </div>
        <Switch on={s.ai_enabled} label="IA activa" onClick={() => save({ ...s, ai_enabled: !s.ai_enabled })} />
      </div>

      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium">WhatsApp activo</span>
          <p className="text-xs text-neutral-500">Interruptor de emergencia para todo el sistema de WhatsApp.</p>
        </div>
        <Switch on={s.whatsapp_enabled} label="WhatsApp activo"
          onClick={() => save({ ...s, whatsapp_enabled: !s.whatsapp_enabled })} />
      </div>

      <div>
        <Label htmlFor="ai-default">Proveedor por defecto</Label>
        <select
          id="ai-default"
          value={s.ai_default_provider}
          onChange={(e) => save({ ...s, ai_default_provider: e.target.value })}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}{configuredProviders.includes(p.id) ? '' : ' — sin llave'}
            </option>
          ))}
        </select>
        {!defaultConfigured && (
          <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            No hay llave para este proveedor, así que la IA no va a responder. Ponla en Render como{' '}
            <code className="font-mono">{PROVIDERS.find((p) => p.id === s.ai_default_provider)?.env}</code>.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="ai-model">Modelo</Label>
        <input
          id="ai-model"
          list="ai-model-options"
          value={s.ai_default_model ?? ''}
          placeholder={`${suggested[0] ?? 'automático'} (por defecto)`}
          onChange={(e) => setS({ ...s, ai_default_model: e.target.value })}
          onBlur={() => save(s)}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <datalist id="ai-model-options">
          {suggested.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <p className="mt-1 text-xs text-neutral-500">
          Déjalo vacío para usar el más barato de {provider?.label ?? 'el proveedor'}
          {suggested[0] ? ` (${suggested[0]})` : ''}. Un restaurante puede elegir otro por su cuenta.
        </p>
        {isReasoning && (
          <p className="mt-1 flex items-start gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Este modelo razona antes de contestar y gasta tokens en eso. Con un tope de
            respuesta bajo se queda pensando y no alcanza a escribir nada. Para un bot de
            WhatsApp sale más caro y más lento sin ganar mucho.
          </p>
        )}
      </div>

      <div>
        <Label htmlFor="ai-cap">Tope de mensajes al mes por restaurante</Label>
        <Input
          id="ai-cap"
          type="number"
          min={0}
          value={s.ai_monthly_message_cap}
          onChange={(e) => setS({ ...s, ai_monthly_message_cap: Number(e.target.value) || 0 })}
          onBlur={() => save(s)}
        />
        <p className="mt-1 text-xs text-neutral-500">
          Solo aplica a quienes usan la llave de Kuik. Al pasarse, el bot sigue funcionando con sus flujos.
        </p>
      </div>

      <div className="rounded-lg bg-neutral-50 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-600">
          <KeyRound className="h-3.5 w-3.5" /> Llaves configuradas
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PROVIDERS.map((p) => (
            <span key={p.id}
              className={`rounded-full px-2 py-0.5 text-xs ${
                configuredProviders.includes(p.id)
                  ? 'bg-green-100 text-green-700'
                  : 'bg-neutral-200 text-neutral-500'
              }`}>
              {p.label}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Las llaves se ponen en variables de entorno, nunca en la base de datos. En Render:
          Environment → Add Environment Variable.
        </p>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Consumo de este mes</h3>
        {usage.length === 0 ? (
          <p className="rounded-lg bg-neutral-50 py-4 text-center text-sm text-neutral-400">
            Nadie ha usado la IA todavía.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                    <th className="py-1.5 pr-2 font-medium">Restaurante</th>
                    <th className="py-1.5 pr-2 font-medium">Llave</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Mensajes</th>
                    <th className="py-1.5 text-right font-medium">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.map((u) => (
                    <tr key={u.tenantId} className="border-b border-neutral-100">
                      <td className="py-1.5 pr-2">{u.name}</td>
                      <td className="py-1.5 pr-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          u.ownKey ? 'bg-neutral-100 text-neutral-500' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {u.ownKey ? 'propia' : 'Kuik'}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{u.messages}</td>
                      <td className="py-1.5 text-right tabular-nums text-neutral-500">
                        {(u.inputTokens + u.outputTokens).toLocaleString('es-MX')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              <strong>{billableMessages}</strong> mensajes facturables en {billable.length} restaurante(s)
              — los de llave propia no le cuestan nada a Kuik.
            </p>
          </>
        )}
      </div>

      {(pending || saved) && (
        <p className="text-xs text-neutral-500">{pending ? 'Guardando…' : 'Guardado.'}</p>
      )}
    </Card>
  );
}
