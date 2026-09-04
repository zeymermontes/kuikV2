'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowRight, Workflow } from 'lucide-react';
import { Card, Textarea, Label, Input } from '@/components/ui';
import { RENDER_VARIABLES } from '@/lib/whatsapp/render';
import { saveWhatsappSettings, saveCannedReply } from '@/app/(dashboard)/whatsapp/actions';

interface Settings {
  enabled: boolean;
  bot_enabled: boolean;
  ai_enabled: boolean;
  away_enabled: boolean;
  max_bot_replies_per_hour: number;
  max_bot_replies_per_day: number;
}

interface Canned { key: string; body: string }

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onClick}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? 'bg-neutral-900' : 'bg-neutral-300'}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${on ? 'left-[1.375rem]' : 'left-0.5'}`} />
    </button>
  );
}

const CANNED_KEYS = ['greeting', 'away', 'fallback', 'handoff', 'reservation_ok'] as const;

export function BotSettings({
  settings: initial,
  canned: initialCanned,
  hasNumber,
}: {
  settings: Settings | null;
  canned: Canned[];
  hasNumber: boolean;
}) {
  const t = useTranslations('whatsapp');
  const [s, setS] = useState<Settings>(
    initial ?? {
      enabled: false, bot_enabled: false, ai_enabled: false, away_enabled: true,
      max_bot_replies_per_hour: 20, max_bot_replies_per_day: 60,
    },
  );
  const [canned, setCanned] = useState<Record<string, string>>(
    Object.fromEntries(initialCanned.map((c) => [c.key, c.body])),
  );
  const [, start] = useTransition();

  function patch(next: Partial<Settings>) {
    setS((cur) => ({ ...cur, ...next }));
    start(async () => saveWhatsappSettings(next));
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-4">
        <h2 className="font-semibold">{t('botTitle')}</h2>

        {!hasNumber && (
          <p className="rounded-lg bg-neutral-100 px-3 py-2 text-sm text-neutral-600">{t('needNumber')}</p>
        )}

        {/* The silent-but-connected case. Without this the only symptom is a
            bot that receives everything and answers nothing. */}
        {hasNumber && (!s.enabled || !s.bot_enabled) && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {!s.enabled ? t('warnDisabled') : t('warnBotOff')}
          </p>
        )}

        {([
          ['enabled', 'field_enabled', 'hint_enabled'],
          ['bot_enabled', 'field_bot', 'hint_bot'],
          ['away_enabled', 'field_away', 'hint_away'],
          ['ai_enabled', 'field_ai', 'hint_ai'],
        ] as const).map(([key, label, hint]) => (
          <div key={key} className="flex items-start justify-between gap-3">
            <div>
              <span className="text-sm font-medium">{t(label)}</span>
              <p className="text-xs text-neutral-500">{t(hint)}</p>
            </div>
            <Switch on={s[key]} onClick={() => patch({ [key]: !s[key] } as Partial<Settings>)} label={t(label)} />
          </div>
        ))}

        <div className="grid gap-3 border-t border-neutral-200 pt-3 sm:grid-cols-2">
          {([
            ['max_bot_replies_per_hour', 'field_maxHour'],
            ['max_bot_replies_per_day', 'field_maxDay'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <Label htmlFor={key}>{t(label)}</Label>
              <Input id={key} type="number" min={1} max={500} value={s[key]}
                onChange={(e) => patch({ [key]: Number(e.target.value) || 1 } as Partial<Settings>)} />
            </div>
          ))}
        </div>
        <p className="text-xs text-neutral-500">{t('hint_limits')}</p>
      </Card>

      <Card className="space-y-4">
        <div>
          <h2 className="font-semibold">{t('messagesTitle')}</h2>
          <p className="text-sm text-neutral-500">{t('messagesHint')}</p>
        </div>
        <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          {t('variables')}: {RENDER_VARIABLES.map((v) => `{{${v}}}`).join('  ')}
        </p>
        {CANNED_KEYS.map((key) => (
          <div key={key}>
            <Label htmlFor={`canned-${key}`}>{t(`canned_${key}`)}</Label>
            <Textarea
              id={`canned-${key}`}
              rows={2}
              value={canned[key] ?? ''}
              onChange={(e) => setCanned((c) => ({ ...c, [key]: e.target.value }))}
              onBlur={(e) => start(async () => saveCannedReply(key, e.target.value))}
            />
          </div>
        ))}
      </Card>

      {/* What the bot can DO lives in the flow builder now. */}
      <Link href="/whatsapp/flows" className="block">
        <Card className="flex items-center gap-3 transition hover:border-neutral-300">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100">
            <Workflow className="h-5 w-5 text-neutral-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t('flowsLink')}</h2>
            <p className="text-sm text-neutral-500">{t('flowsLinkHint')}</p>
          </div>
          <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400" />
        </Card>
      </Link>
    </div>
  );
}
