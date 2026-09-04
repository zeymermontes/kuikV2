'use client';

import { useTranslations } from 'next-intl';
import { Plus, Trash2, X } from 'lucide-react';
import type { Node } from '@xyflow/react';
import { Button, Field, Input, Label, Textarea } from '@/components/ui';
import { slugify } from '@/lib/utils';
import { slotsOf, type BranchCondition, type FlowGraph, type FlowSlot } from '@/lib/whatsapp/flows/schema';

/**
 * Properties for the selected node — a slide-over WITHOUT a backdrop, so the
 * canvas stays clickable while editing. All edits flow straight back into the
 * canvas state; the canvas autosaves.
 */

type Data = Record<string, unknown>;

export function NodePanel({
  node, graph, onChange, onClose, onDelete,
}: {
  node: Node<Data>;
  graph: FlowGraph | null;
  onChange: (data: Data) => void;
  onClose: () => void;
  onDelete?: () => void;
}) {
  const t = useTranslations('whatsapp.flows');

  return (
    <div className="animate-slide-up absolute inset-y-0 right-0 z-10 flex w-full max-w-[380px] flex-col border-l border-neutral-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
        <h2 className="text-sm font-semibold">{t(`node_${node.type}`)}</h2>
        <div className="flex items-center gap-1">
          {onDelete && (
            <button onClick={onDelete} title={t('deleteNode')} className="p-1.5 text-neutral-400 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
          <button onClick={onClose} aria-label="close" className="p-1.5 text-neutral-400 hover:text-neutral-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {node.type === 'message' && <MessageFields data={node.data} onChange={onChange} />}
        {node.type === 'question' && <QuestionFields data={node.data} onChange={onChange} />}
        {node.type === 'branch' && <BranchFields data={node.data} onChange={onChange} graph={graph} />}
        {node.type === 'confirm' && <ConfirmFields data={node.data} onChange={onChange} />}
        {node.type === 'action' && <ActionFields data={node.data} onChange={onChange} />}
        {node.type === 'end' && <EndFields data={node.data} onChange={onChange} />}
        {node.type === 'start' && <p className="text-sm text-neutral-500">{t('startHint')}</p>}
      </div>
    </div>
  );
}

const SELECT_CLS =
  'w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10';

function MessageFields({ data, onChange }: { data: Data; onChange: (d: Data) => void }) {
  const t = useTranslations('whatsapp.flows');
  return (
    <Field label={t('fieldBody')} hint={t('varsHint')}>
      <Textarea rows={4} value={String(data.body ?? '')} onChange={(e) => onChange({ ...data, body: e.target.value })} />
    </Field>
  );
}

function ConfirmFields({ data, onChange }: { data: Data; onChange: (d: Data) => void }) {
  const t = useTranslations('whatsapp.flows');
  return (
    <Field label={t('fieldConfirmBody')} hint={t('confirmHint')}>
      <Textarea rows={4} value={String(data.body ?? '')} onChange={(e) => onChange({ ...data, body: e.target.value })} />
    </Field>
  );
}

function EndFields({ data, onChange }: { data: Data; onChange: (d: Data) => void }) {
  const t = useTranslations('whatsapp.flows');
  return (
    <>
      <Field label={t('fieldOutcome')}>
        <select
          className={SELECT_CLS}
          value={String(data.outcome ?? 'completed')}
          onChange={(e) => onChange({ ...data, outcome: e.target.value })}
        >
          <option value="completed">{t('outcomeCompleted')}</option>
          <option value="canceled">{t('outcomeCanceled')}</option>
        </select>
      </Field>
      <Field label={t('fieldEndBody')} hint={t('fieldEndBodyHint')}>
        <Textarea rows={3} value={String(data.body ?? '')} onChange={(e) => onChange({ ...data, body: e.target.value || undefined })} />
      </Field>
    </>
  );
}

function ActionFields({ data, onChange }: { data: Data; onChange: (d: Data) => void }) {
  const t = useTranslations('whatsapp.flows');
  return (
    <Field label={t('fieldAction')} hint={t('actionHint')}>
      <select
        className={SELECT_CLS}
        value={String(data.kind ?? 'handoff')}
        onChange={(e) => onChange({ ...data, kind: e.target.value })}
      >
        <option value="create_reservation">{t('action_create_reservation')}</option>
        <option value="handoff">{t('action_handoff')}</option>
        <option value="send_menu_link">{t('action_send_menu_link')}</option>
        <option value="notify_staff">{t('action_notify_staff')}</option>
      </select>
    </Field>
  );
}

const SLOT_TYPES: FlowSlot['type'][] = ['text', 'number', 'phone', 'email', 'date', 'time', 'choice'];

function QuestionFields({ data, onChange }: { data: Data; onChange: (d: Data) => void }) {
  const t = useTranslations('whatsapp.flows');
  const slot = (data.slot ?? {}) as Partial<FlowSlot>;
  const setSlot = (patch: Partial<FlowSlot>) => onChange({ ...data, slot: { ...slot, ...patch } });

  return (
    <>
      <Field label={t('fieldSlotLabel')} hint={t('fieldSlotLabelHint')}>
        <Input
          value={slot.label ?? ''}
          onChange={(e) => {
            const label = e.target.value;
            // Keep the storage key in step with the label until it's touched.
            const auto = slugify(label).replace(/-/g, '_');
            setSlot({ label, ...(auto ? { key: auto } : {}) });
          }}
          placeholder={t('slotPlaceholder')}
        />
      </Field>
      <Field label={t('fieldSlotKey')} hint={t('fieldSlotKeyHint')}>
        <Input
          value={slot.key ?? ''}
          onChange={(e) => setSlot({ key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 40) })}
        />
      </Field>
      <Field label={t('fieldSlotType')}>
        <select className={SELECT_CLS} value={slot.type ?? 'text'} onChange={(e) => setSlot({ type: e.target.value as FlowSlot['type'] })}>
          {SLOT_TYPES.map((st) => <option key={st} value={st}>{t(`slotType_${st}`)}</option>)}
        </select>
      </Field>

      {slot.type === 'number' && (
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <Label>{t('fieldMin')}</Label>
            <Input type="number" value={slot.min ?? ''} onChange={(e) => setSlot({ min: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
          <div>
            <Label>{t('fieldMax')}</Label>
            <Input type="number" value={slot.max ?? ''} onChange={(e) => setSlot({ max: e.target.value === '' ? undefined : Number(e.target.value) })} />
          </div>
        </div>
      )}

      {slot.type === 'choice' && <OptionsEditor slot={slot} setSlot={setSlot} />}

      <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={slot.required !== false}
          onChange={(e) => setSlot({ required: e.target.checked ? undefined : false })}
          className="h-4 w-4 accent-neutral-900"
        />
        {t('fieldRequired')}
      </label>

      <Field label={t('fieldPrompt')} hint={t('varsHint')}>
        <Textarea rows={3} value={String(data.prompt ?? '')} onChange={(e) => onChange({ ...data, prompt: e.target.value })} />
      </Field>
      <Field label={t('fieldRetryPrompt')} hint={t('fieldRetryPromptHint')}>
        <Textarea rows={2} value={String(data.retryPrompt ?? '')} onChange={(e) => onChange({ ...data, retryPrompt: e.target.value || undefined })} />
      </Field>
    </>
  );
}

function OptionsEditor({ slot, setSlot }: { slot: Partial<FlowSlot>; setSlot: (p: Partial<FlowSlot>) => void }) {
  const t = useTranslations('whatsapp.flows');
  const options = slot.options ?? [];
  const set = (i: number, title: string) => {
    const next = [...options];
    const id = slugify(title, `op_${i + 1}`).replace(/-/g, '_').slice(0, 30);
    next[i] = { ...next[i], id, title: title.slice(0, 24) };
    setSlot({ options: next });
  };

  return (
    <Field label={t('fieldOptions')} hint={t('fieldOptionsHint')}>
      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input value={o.title} onChange={(e) => set(i, e.target.value)} />
            <button
              onClick={() => setSlot({ options: options.filter((_, j) => j !== i) })}
              className="p-1.5 text-neutral-400 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        {options.length < 10 && (
          <Button variant="secondary" className="w-full px-3 py-1.5 text-xs"
            onClick={() => setSlot({ options: [...options, { id: `op_${options.length + 1}`, title: '' }] })}>
            <Plus className="h-3.5 w-3.5" /> {t('addOption')}
          </Button>
        )}
      </div>
    </Field>
  );
}

const OPS: BranchCondition['op'][] = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'answered', 'not_answered'];

function BranchFields({ data, onChange, graph }: { data: Data; onChange: (d: Data) => void; graph: FlowGraph | null }) {
  const t = useTranslations('whatsapp.flows');
  const conditions = (data.conditions ?? []) as BranchCondition[];
  const slots = graph ? slotsOf(graph) : [];
  const set = (next: BranchCondition[]) => onChange({ ...data, conditions: next });

  return (
    <Field label={t('fieldConditions')} hint={t('conditionsHint')}>
      <div className="space-y-3">
        {conditions.map((c, i) => (
          <div key={c.id} className="space-y-2 rounded-xl border border-neutral-200 p-3">
            <div className="flex items-center gap-2">
              <select className={SELECT_CLS} value={c.slot}
                onChange={(e) => set(conditions.map((x, j) => (j === i ? { ...x, slot: e.target.value } : x)))}>
                <option value="">{t('pickSlot')}</option>
                {slots.map((s) => <option key={s.key} value={s.key}>{s.label || s.key}</option>)}
              </select>
              <button onClick={() => set(conditions.filter((_, j) => j !== i))} className="p-1.5 text-neutral-400 hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <select className={SELECT_CLS} value={c.op}
                onChange={(e) => set(conditions.map((x, j) => (j === i ? { ...x, op: e.target.value as BranchCondition['op'] } : x)))}>
                {OPS.map((op) => <option key={op} value={op}>{t(`op_${op}`)}</option>)}
              </select>
              {!['answered', 'not_answered'].includes(c.op) && (
                <Input value={String(c.value ?? '')} placeholder={t('valuePlaceholder')}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const value = raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw;
                    set(conditions.map((x, j) => (j === i ? { ...x, value } : x)));
                  }} />
              )}
            </div>
          </div>
        ))}
        {conditions.length < 10 && (
          <Button variant="secondary" className="w-full px-3 py-1.5 text-xs"
            onClick={() => set([...conditions, { id: `c_${Date.now().toString(36)}`, slot: slots[0]?.key ?? '', op: 'eq', value: '' }])}>
            <Plus className="h-3.5 w-3.5" /> {t('addCondition')}
          </Button>
        )}
      </div>
    </Field>
  );
}
