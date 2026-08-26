'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input, Textarea, Label, Button } from '@/components/ui';
import type { FlowDef, Slot } from '@/lib/whatsapp/flow';
import { saveGoal } from '@/app/(dashboard)/whatsapp/actions';

/**
 * The script the bot follows when AI is off.
 *
 * This is the whole of "how does it work without AI": an ordered list of
 * questions, each with a type that decides how the answer is understood, then a
 * summary read back before anything is booked. Every question with options is
 * sent as tappable buttons, which is what keeps the no-AI mode usable — a diner
 * who taps never has to be parsed.
 */

const TYPES: Slot['type'][] = ['number', 'date', 'time', 'text', 'choice'];

/** Slot keys the booking action understands; anything else is just a note. */
const KNOWN_KEYS = ['party_size', 'date', 'time', 'customer_name', 'area', 'note'] as const;

const EMPTY_SLOT: Slot = { key: 'note', type: 'text', prompt: '' };

export function FlowEditor({
  goalId,
  initial,
}: {
  goalId: string;
  initial: FlowDef | null;
}) {
  const t = useTranslations('whatsapp');
  const [flow, setFlow] = useState<FlowDef>(
    initial ?? { slots: [], confirm: { body: '' }, onConfirm: 'create_reservation' },
  );
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();

  function update(next: FlowDef) {
    setFlow(next);
    setDirty(true);
  }

  function patchSlot(i: number, patch: Partial<Slot>) {
    update({ ...flow, slots: flow.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  }

  function move(i: number, delta: number) {
    const j = i + delta;
    if (j < 0 || j >= flow.slots.length) return;
    const slots = [...flow.slots];
    [slots[i], slots[j]] = [slots[j], slots[i]];
    update({ ...flow, slots });
  }

  function save() {
    setDirty(false);
    start(async () => saveGoal(goalId, { flow }));
  }

  return (
    <div className="mt-3 space-y-3 rounded-lg bg-neutral-50 p-3">
      <div>
        <h4 className="text-sm font-medium">{t('flowTitle')}</h4>
        <p className="text-xs text-neutral-500">{t('flowHint')}</p>
      </div>

      <div className="space-y-2">
        {flow.slots.map((slot, i) => (
          <div key={i} className="rounded-lg border border-neutral-200 bg-white p-2.5">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-[11px] font-semibold text-white">
                {i + 1}
              </span>
              <select
                value={slot.key}
                onChange={(e) => patchSlot(i, { key: e.target.value })}
                aria-label={t('flow_field')}
                className="rounded-lg border border-neutral-300 px-2 py-1 text-xs"
              >
                {KNOWN_KEYS.map((k) => (
                  <option key={k} value={k}>{t(`flow_key_${k}`)}</option>
                ))}
              </select>
              <select
                value={slot.type}
                onChange={(e) => patchSlot(i, { type: e.target.value as Slot['type'] })}
                aria-label={t('flow_type')}
                className="rounded-lg border border-neutral-300 px-2 py-1 text-xs"
              >
                {TYPES.map((ty) => (
                  <option key={ty} value={ty}>{t(`flow_type_${ty}`)}</option>
                ))}
              </select>
              <div className="ml-auto flex gap-0.5">
                <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={t('flow_up')}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => move(i, 1)} disabled={i === flow.slots.length - 1} aria-label={t('flow_down')}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-100 disabled:opacity-30">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => update({ ...flow, slots: flow.slots.filter((_, j) => j !== i) })}
                  aria-label={t('flow_remove')}
                  className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <Input
              value={slot.prompt}
              onChange={(e) => patchSlot(i, { prompt: e.target.value })}
              placeholder={t('flow_promptPlaceholder')}
              aria-label={t('flow_prompt')}
            />

            {slot.type === 'choice' && (
              <div className="mt-2">
                <Label htmlFor={`opts-${i}`} className="text-xs">{t('flow_options')}</Label>
                <Input
                  id={`opts-${i}`}
                  // Comma-separated is enough here: these become tappable
                  // buttons, and WhatsApp only shows three before it has to
                  // fall back to a list anyway.
                  value={(slot.options ?? []).map((o) => o.title).join(', ')}
                  onChange={(e) =>
                    patchSlot(i, {
                      options: e.target.value
                        .split(',')
                        .map((v) => v.trim())
                        .filter(Boolean)
                        .map((title) => ({ id: title.toLowerCase().replace(/\s+/g, '_'), title })),
                    })
                  }
                  placeholder={t('flow_optionsPlaceholder')}
                />
                <p className="mt-1 text-[11px] text-neutral-500">{t('flow_optionsHint')}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      <Button
        variant="secondary"
        onClick={() => update({ ...flow, slots: [...flow.slots, { ...EMPTY_SLOT }] })}
      >
        <Plus className="h-4 w-4" /> {t('flow_addQuestion')}
      </Button>

      <div>
        <Label htmlFor={`confirm-${goalId}`} className="flex items-center gap-1.5">
          <MessageSquare className="h-3.5 w-3.5" /> {t('flow_confirm')}
        </Label>
        <Textarea
          id={`confirm-${goalId}`}
          rows={2}
          value={flow.confirm?.body ?? ''}
          onChange={(e) => update({ ...flow, confirm: { body: e.target.value } })}
          placeholder={t('flow_confirmPlaceholder')}
        />
        <p className="mt-1 text-[11px] text-neutral-500">
          {t('flow_confirmHint', { vars: flow.slots.map((s) => `{{${s.key}}}`).join(' ') })}
        </p>
      </div>

      <div>
        <Label htmlFor={`cancel-${goalId}`}>{t('flow_cancel')}</Label>
        <Input
          id={`cancel-${goalId}`}
          value={flow.onCancel ?? ''}
          onChange={(e) => update({ ...flow, onCancel: e.target.value })}
        />
      </div>

      <FlowPreview flow={flow} />

      <Button onClick={save} disabled={!dirty || pending}>
        {pending ? t('saving') : dirty ? t('save') : t('saved')}
      </Button>
    </div>
  );
}

/** What the diner will actually see, so the script can be read before it ships. */
function FlowPreview({ flow }: { flow: FlowDef }) {
  const t = useTranslations('whatsapp');
  const sample: Record<string, string> = {
    party_size: '4', date: 'mañana', time: '20:00',
    customer_name: 'Ana', area: 'Salón', note: '—',
  };
  const filled = (flow.confirm?.body ?? '').replace(
    /\{\{(\w+)\}\}/g,
    (_, k: string) => sample[k] ?? `{{${k}}}`,
  );

  return (
    <div className="rounded-lg bg-white p-3">
      <p className="mb-2 text-xs font-medium text-neutral-500">{t('flow_preview')}</p>
      <div className="space-y-1.5">
        {flow.slots.filter((s) => s.prompt).map((s, i) => (
          <div key={i} className="max-w-[85%] rounded-2xl rounded-tl-sm bg-neutral-100 px-3 py-1.5 text-sm">
            {s.prompt}
            {s.options && s.options.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {s.options.map((o) => (
                  <span key={o.id} className="rounded-full border border-neutral-300 px-2 py-0.5 text-[11px]">
                    {o.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {filled && (
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-neutral-100 px-3 py-1.5 text-sm">
            {filled}
            <div className="mt-1 flex gap-1">
              <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[11px]">Sí, confirmar</span>
              <span className="rounded-full border border-neutral-300 px-2 py-0.5 text-[11px]">No</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
