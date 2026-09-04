'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { saveFlowSettings } from '@/app/(dashboard)/whatsapp/flows/actions';
import type { WhatsappFlow } from '@/lib/whatsapp/types';
import type { Trigger } from '@/lib/whatsapp/intent';

/**
 * Everything about a flow that ISN'T the graph: name, mode, triggers, and the
 * two timers (nudge and close). Kept out of the graph on purpose — changing a
 * timer takes effect immediately, no republish.
 */
export function FlowSettingsPanel({
  flow, aiMode, onModeChange, onClose,
}: {
  flow: WhatsappFlow;
  aiMode: boolean;
  onModeChange: (ai: boolean) => void;
  onClose: () => void;
}) {
  const t = useTranslations('whatsapp.flows');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState(flow.name);
  const [description, setDescription] = useState(flow.description ?? '');
  const [keywords, setKeywords] = useState(
    flow.triggers.filter((x) => x.kind === 'keyword').map((x) => x.value).join(', '),
  );
  const [nudgeAfter, setNudgeAfter] = useState(flow.nudge_after_minutes?.toString() ?? '');
  const [maxNudges, setMaxNudges] = useState(String(flow.max_nudges));
  const [nudgeMessage, setNudgeMessage] = useState(flow.nudge_message ?? '');
  const [closeAfter, setCloseAfter] = useState(flow.close_after_minutes?.toString() ?? '');
  const [closeMessage, setCloseMessage] = useState(flow.close_message ?? '');

  const save = () => startTransition(async () => {
    const triggers: Trigger[] = [
      ...keywords.split(',').map((k) => k.trim()).filter(Boolean)
        .map((value) => ({ kind: 'keyword' as const, value })),
      // Non-keyword triggers (regex, button ids) survive untouched.
      ...flow.triggers.filter((x) => x.kind !== 'keyword'),
    ];
    const res = await saveFlowSettings({
      id: flow.id,
      name,
      description,
      mode: aiMode ? 'ai' : 'linear',
      triggers,
      nudge_after_minutes: nudgeAfter ? Number(nudgeAfter) : null,
      max_nudges: Number(maxNudges) || 0,
      nudge_message: nudgeMessage || null,
      close_after_minutes: closeAfter ? Number(closeAfter) : null,
      close_message: closeMessage || null,
    });
    if (res.ok) {
      onClose();
      router.refresh();
    }
  });

  return (
    <div className="animate-slide-up absolute inset-y-0 right-0 z-10 flex w-full max-w-[380px] flex-col border-l border-neutral-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-semibold">{t('settings')}</h2>
        <button onClick={onClose} aria-label="close" className="p-1.5 text-neutral-400 hover:text-neutral-700">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <Field label={t('name')}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t('description')} hint={t('descriptionHint')}>
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>

        <Field label={t('mode')} hint={t('modeHint')}>
          <div className="grid grid-cols-2 gap-2">
            {([false, true] as const).map((ai) => (
              <button
                key={String(ai)}
                onClick={() => onModeChange(ai)}
                className={cn(
                  'rounded-xl border px-3 py-2 text-sm transition',
                  aiMode === ai ? 'border-neutral-900 font-semibold ring-2 ring-neutral-900/10' : 'border-neutral-200 hover:border-neutral-300',
                )}
              >
                {ai ? t('modeAi') : t('modeLinear')}
              </button>
            ))}
          </div>
        </Field>

        <Field label={t('triggers')} hint={t('triggersHint')}>
          <Textarea rows={2} value={keywords} onChange={(e) => setKeywords(e.target.value)}
            placeholder={t('triggersPlaceholder')} />
        </Field>

        <div className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          {t('timersTitle')}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('nudgeAfter')} hint={t('nudgeAfterHint')}>
            <Input type="number" min={0} value={nudgeAfter} onChange={(e) => setNudgeAfter(e.target.value)} placeholder="15" />
          </Field>
          <Field label={t('maxNudges')}>
            <Input type="number" min={0} max={5} value={maxNudges} onChange={(e) => setMaxNudges(e.target.value)} />
          </Field>
        </div>
        <Field label={t('nudgeMessage')} hint={t('nudgeMessageHint')}>
          <Textarea rows={2} value={nudgeMessage} onChange={(e) => setNudgeMessage(e.target.value)} />
        </Field>
        <Field label={t('closeAfter')} hint={t('closeAfterHint')}>
          <Input type="number" min={0} value={closeAfter} onChange={(e) => setCloseAfter(e.target.value)} placeholder="60" />
        </Field>
        <Field label={t('closeMessage')} hint={t('closeMessageHint')}>
          <Textarea rows={2} value={closeMessage} onChange={(e) => setCloseMessage(e.target.value)} />
        </Field>
      </div>

      <div className="border-t border-neutral-100 p-3">
        <Button className="w-full" disabled={pending} onClick={save}>{t('saveSettings')}</Button>
      </div>
    </div>
  );
}
