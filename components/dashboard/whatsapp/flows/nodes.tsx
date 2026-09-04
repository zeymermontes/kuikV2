'use client';

import { createContext, useContext } from 'react';
import { useTranslations } from 'next-intl';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import {
  CheckCircle2, Flag, GitBranch, HelpCircle, MessageSquare, Play, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  BranchNode as BranchNodeT, ConfirmNode as ConfirmNodeT, EndNode as EndNodeT,
  MessageNode as MessageNodeT, QuestionNode as QuestionNodeT, ActionNode as ActionNodeT,
} from '@/lib/whatsapp/flows/schema';

/**
 * The canvas nodes. Each is a small card in the house style — white, rounded,
 * a color-coded stripe per type — with its exits as labeled handles, so the
 * graph on screen IS the graph the engine walks: an option's handle is the
 * edge the diner's tap will take.
 */

/** nodeId → validation issue codes; set by the canvas, read by every node. */
export const IssuesContext = createContext<Map<string, string[]>>(new Map());

/** In AI mode questions become "slots" and branches are ignored — shown dimmed. */
export const AiModeContext = createContext<boolean>(false);

const HANDLE_CLS = '!h-3 !w-3 !border-2 !border-white !bg-neutral-400 hover:!bg-neutral-900';

function Shell({
  id, selected, accent, icon, title, badge, children, exits, entry = true, dimmed,
}: {
  id: string;
  selected?: boolean;
  accent: string;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  children?: React.ReactNode;
  /** Labeled exit handles rendered at the card's foot; null = single side exit. */
  exits?: { id: string | null; label: string }[] | null;
  entry?: boolean;
  dimmed?: boolean;
}) {
  const issues = useContext(IssuesContext).get(id) ?? [];
  return (
    <div
      className={cn(
        'w-60 rounded-2xl border bg-white shadow-sm transition',
        selected ? 'border-neutral-900 shadow-md' : 'border-neutral-200',
        issues.length > 0 && 'ring-2 ring-red-400',
        dimmed && 'opacity-50',
      )}
    >
      {entry && <Handle type="target" position={Position.Left} className={HANDLE_CLS} />}
      <div className={cn('flex items-center gap-2 rounded-t-2xl px-3 py-2 text-xs font-semibold text-white', accent)}>
        {icon}
        <span className="truncate">{title}</span>
        {badge && <span className="ml-auto rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">{badge}</span>}
      </div>
      {children && <div className="px-3 py-2 text-xs text-neutral-600">{children}</div>}
      {exits === null ? (
        <Handle type="source" position={Position.Right} className={HANDLE_CLS} />
      ) : exits && exits.length > 0 ? (
        <div className="border-t border-neutral-100 px-3 py-1.5">
          {exits.map((exit) => (
            <div key={exit.id ?? '__default'} className="relative flex items-center justify-end py-1 pr-2 text-[11px] text-neutral-500">
              <span className="truncate">{exit.label}</span>
              <Handle
                id={exit.id ?? undefined}
                type="source"
                position={Position.Right}
                className={HANDLE_CLS}
                style={{ position: 'absolute', right: -21, top: '50%' }}
              />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function StartNode({ id, selected }: NodeProps<Node<Record<string, never>, 'start'>>) {
  const t = useTranslations('whatsapp.flows');
  return (
    <Shell id={id} selected={selected} accent="bg-neutral-900" entry={false} exits={null}
      icon={<Play className="h-3.5 w-3.5" />} title={t('node_start')} />
  );
}

export function MessageNode({ id, selected, data }: NodeProps<Node<MessageNodeT['data'], 'message'>>) {
  const t = useTranslations('whatsapp.flows');
  return (
    <Shell id={id} selected={selected} accent="bg-sky-600" exits={null}
      icon={<MessageSquare className="h-3.5 w-3.5" />} title={t('node_message')}>
      {clip(data.body) || '—'}
    </Shell>
  );
}

export function QuestionNode({ id, selected, data }: NodeProps<Node<QuestionNodeT['data'], 'question'>>) {
  const t = useTranslations('whatsapp.flows');
  const ai = useContext(AiModeContext);
  const slot = data.slot;
  const exits = slot.type === 'choice' && slot.options?.length
    ? [...slot.options.map((o) => ({ id: o.id, label: o.title })), { id: null, label: t('defaultExit') }]
    : null;
  return (
    <Shell id={id} selected={selected} accent="bg-blue-600" exits={exits}
      icon={<HelpCircle className="h-3.5 w-3.5" />}
      title={ai ? t('slotTitle', { label: slot.label || slot.key }) : slot.label || t('node_question')}
      badge={slot.required === false ? t('optionalBadge') : t(`slotType_${slot.type}`)}>
      {clip(data.prompt) || '—'}
    </Shell>
  );
}

export function BranchNode({ id, selected, data }: NodeProps<Node<BranchNodeT['data'], 'branch'>>) {
  const t = useTranslations('whatsapp.flows');
  const ai = useContext(AiModeContext);
  return (
    <Shell id={id} selected={selected} accent="bg-amber-500" dimmed={ai}
      icon={<GitBranch className="h-3.5 w-3.5" />} title={t('node_branch')}
      exits={[
        ...data.conditions.map((c) => ({
          id: c.id,
          label: c.op === 'answered' || c.op === 'not_answered'
            ? `${c.slot} ${c.op === 'answered' ? '✓' : '∅'}`
            : `${c.slot} ${c.op} ${c.value ?? ''}`,
        })),
        { id: 'else', label: t('elseExit') },
      ]}>
      {ai ? t('aiBranchHint') : null}
    </Shell>
  );
}

export function ConfirmNode({ id, selected, data }: NodeProps<Node<ConfirmNodeT['data'], 'confirm'>>) {
  const t = useTranslations('whatsapp.flows');
  return (
    <Shell id={id} selected={selected} accent="bg-teal-600"
      icon={<CheckCircle2 className="h-3.5 w-3.5" />} title={t('node_confirm')}
      exits={[{ id: 'yes', label: t('yesExit') }, { id: 'no', label: t('noExit') }]}>
      {clip(data.body) || '—'}
    </Shell>
  );
}

export function ActionNode({ id, selected, data }: NodeProps<Node<ActionNodeT['data'], 'action'>>) {
  const t = useTranslations('whatsapp.flows');
  return (
    <Shell id={id} selected={selected} accent="bg-emerald-600" exits={null}
      icon={<Zap className="h-3.5 w-3.5" />} title={t('node_action')}>
      {t(`action_${data.kind}` as `action_${ActionNodeT['data']['kind']}`)}
    </Shell>
  );
}

export function EndNode({ id, selected, data }: NodeProps<Node<EndNodeT['data'], 'end'>>) {
  const t = useTranslations('whatsapp.flows');
  return (
    <Shell id={id} selected={selected} accent={data.outcome === 'canceled' ? 'bg-neutral-500' : 'bg-neutral-800'}
      icon={<Flag className="h-3.5 w-3.5" />}
      title={data.outcome === 'canceled' ? t('endCanceledTitle') : t('node_end')}>
      {data.body ? clip(data.body) : null}
    </Shell>
  );
}

export const NODE_TYPES = {
  start: StartNode,
  message: MessageNode,
  question: QuestionNode,
  branch: BranchNode,
  confirm: ConfirmNode,
  action: ActionNode,
  end: EndNode,
};
