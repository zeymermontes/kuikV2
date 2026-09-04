'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Search, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { fetchConversations } from '@/app/(dashboard)/whatsapp/inbox/actions';
import type { ConversationItem, InboxFilters } from '@/app/(dashboard)/whatsapp/inbox/query';
import type { FlowRunStatus } from '@/lib/whatsapp/types';
import { withParams, type InboxFlowRef } from './InboxShell';

export const RUN_STATUS_STYLE: Record<FlowRunStatus, string> = {
  active: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  abandoned: 'bg-amber-50 text-amber-700',
  expired: 'bg-neutral-100 text-neutral-500',
  handoff: 'bg-violet-50 text-violet-700',
  canceled: 'bg-neutral-100 text-neutral-500',
};

const STATUSES: FlowRunStatus[] = ['active', 'completed', 'abandoned', 'expired', 'handoff', 'canceled'];

/** URL-as-state: search and filters navigate; pagination appends locally. */
export function ConversationList({
  items, cursor, filters, flows, selectedId,
}: {
  items: ConversationItem[];
  cursor: string | null;
  filters: InboxFilters;
  flows: InboxFlowRef[];
  selectedId: string | null;
}) {
  const t = useTranslations('whatsapp.inbox');
  const router = useRouter();
  const [extra, setExtra] = useState<ConversationItem[]>([]);
  const [nextCursor, setNextCursor] = useState(cursor);
  const [q, setQ] = useState(filters.q ?? '');
  const [loading, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A new server page resets local pagination (adjust-state-during-render).
  const [prevItems, setPrevItems] = useState(items);
  if (prevItems !== items) {
    setPrevItems(items);
    setExtra([]);
    setNextCursor(cursor);
  }

  const navigate = (patch: Partial<InboxFilters>) => {
    router.replace(withParams({ ...filters, ...patch }, null));
  };

  const flowName = (id: string) => flows.find((f) => f.id === id)?.name ?? '';
  const all = [...items, ...extra];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-2 border-b border-neutral-100 p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              if (debounce.current) clearTimeout(debounce.current);
              debounce.current = setTimeout(() => navigate({ q: e.target.value }), 400);
            }}
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-neutral-900"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filters.status ?? ''}
            onChange={(e) => navigate({ status: e.target.value as FlowRunStatus | '' })}
            className="w-1/2 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs outline-none"
          >
            <option value="">{t('anyStatus')}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status_${s}`)}</option>)}
          </select>
          <select
            value={filters.flow ?? ''}
            onChange={(e) => navigate({ flow: e.target.value })}
            className="w-1/2 rounded-lg border border-neutral-200 px-2 py-1.5 text-xs outline-none"
          >
            <option value="">{t('anyFlow')}</option>
            {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {all.length === 0 && (
          <p className="p-6 text-center text-sm text-neutral-400">{t('empty')}</p>
        )}
        {all.map((item) => (
          <button
            key={item.id}
            onClick={() => router.replace(withParams(filters, item.id))}
            className={cn(
              'flex w-full items-center gap-3 border-b border-neutral-50 px-3 py-2.5 text-left transition hover:bg-neutral-50',
              selectedId === item.id && 'bg-neutral-100 hover:bg-neutral-100',
            )}
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <UserRound className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">
                  {item.contactName || item.phone || '—'}
                </span>
                <span className="shrink-0 text-[10px] text-neutral-400">
                  {relTime(item.lastInboundAt)}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5">
                {item.run ? (
                  <>
                    <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', RUN_STATUS_STYLE[item.run.status])}>
                      {t(`status_${item.run.status}`)}
                    </span>
                    <span className="truncate text-[11px] text-neutral-400">{flowName(item.run.flowId)}</span>
                  </>
                ) : (
                  <span className="text-[11px] text-neutral-400">{t('noRunShort')}</span>
                )}
                {item.handoffAt && (
                  <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                    {t('handoffBadge')}
                  </span>
                )}
              </div>
            </div>
          </button>
        ))}
        {nextCursor && (
          <button
            disabled={loading}
            onClick={() => startTransition(async () => {
              const res = await fetchConversations({ filters, cursor: nextCursor });
              setExtra((prev) => [...prev, ...res.items]);
              setNextCursor(res.nextCursor);
            })}
            className="w-full py-3 text-center text-xs font-medium text-neutral-500 hover:bg-neutral-50 disabled:opacity-50"
          >
            {loading ? t('loading') : t('loadMore')}
          </button>
        )}
      </div>
    </div>
  );
}

function relTime(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}
