'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Bot, PanelRightOpen, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { setConversationBot } from '@/app/(dashboard)/whatsapp/inbox/actions';
import type { ConversationItem, InboxFilters } from '@/app/(dashboard)/whatsapp/inbox/query';
import type { MessageOrigin, WhatsappFlowRun } from '@/lib/whatsapp/types';
import { ConversationList } from './ConversationList';
import { Transcript } from './Transcript';
import { RunPanel } from './RunPanel';

export interface InboxMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  origin: MessageOrigin;
  body: string | null;
  status: string | null;
  created_at: string;
}

export interface InboxFlowRef {
  id: string;
  name: string;
  /** Present only when a conversation is selected (labels for its run). */
  draft_graph?: Record<string, unknown>;
}

/**
 * Read-only inbox: conversations | transcript | run state. Desktop is three
 * panes; mobile shows one at a time (the run panel becomes a bottom sheet).
 * New messages arrive live over the whatsapp_messages realtime channel — the
 * same one the boards already use.
 */
export interface SelectedConv {
  id: string;
  bot_enabled: boolean;
  handoff_at: string | null;
  handoff_by: string | null;
}

export function InboxShell({
  tenantId, initialItems, initialCursor, filters, selectedId, selectedConv, messages, runs, flows,
}: {
  tenantId: string;
  initialItems: ConversationItem[];
  initialCursor: string | null;
  filters: InboxFilters;
  selectedId: string | null;
  selectedConv: SelectedConv | null;
  messages: InboxMessage[];
  runs: WhatsappFlowRun[];
  flows: InboxFlowRef[];
}) {
  const t = useTranslations('whatsapp.inbox');
  const router = useRouter();
  const [live, setLive] = useState<InboxMessage[]>(messages);
  const [runSheet, setRunSheet] = useState(false);
  const selectedRef = useRef(selectedId);
  useEffect(() => { selectedRef.current = selectedId; }, [selectedId]);

  // A fresh server transcript replaces the live one (adjust-during-render).
  const [prevMessages, setPrevMessages] = useState(messages);
  if (prevMessages !== messages) {
    setPrevMessages(messages);
    setLive(messages);
  }

  // Refreshing re-runs the server queries (list order, run state) — throttled
  // so a burst of messages doesn't stampede the router.
  const lastRefresh = useRef(0);
  const refresh = useCallback(() => {
    if (Date.now() - lastRefresh.current < 4000) return;
    lastRefresh.current = Date.now();
    router.refresh();
  }, [router]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`wa-inbox-${tenantId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const row = payload.new as InboxMessage & { conversation_id: string };
          if (row.conversation_id === selectedRef.current) {
            setLive((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          }
          refresh();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tenantId, refresh]);

  const latestRun = runs[0] ?? null;

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="grid h-[calc(100dvh-14rem)] min-h-[420px] lg:grid-cols-[320px_1fr_340px]">
        {/* Conversations */}
        <div className={cn('min-h-0 border-neutral-200 lg:border-r', selectedId && 'hidden lg:block')}>
          <ConversationList
            items={initialItems}
            cursor={initialCursor}
            filters={filters}
            flows={flows}
            selectedId={selectedId}
          />
        </div>

        {/* Transcript */}
        <div className={cn('min-h-0 flex-col', selectedId ? 'flex' : 'hidden lg:flex')}>
          {selectedId ? (
            <>
              <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 lg:hidden">
                <button
                  onClick={() => router.replace(withParams(filters, null))}
                  className="rounded-lg px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100"
                >
                  ← {t('back')}
                </button>
                <div className="flex-1" />
                <button onClick={() => setRunSheet(true)} className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100">
                  <PanelRightOpen className="h-4 w-4" />
                </button>
              </div>
              <Transcript messages={live} />
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-neutral-400">
              {t('pickConversation')}
            </div>
          )}
        </div>

        {/* Run state — right column on desktop */}
        <div className="hidden min-h-0 overflow-y-auto border-l border-neutral-200 lg:block">
          {selectedId && (
            <>
              {selectedConv && <BotToggle conv={selectedConv} />}
              <RunPanel runs={runs} flows={flows} />
            </>
          )}
        </div>
      </div>

      {/* Run state — bottom sheet on mobile */}
      {runSheet && selectedId && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="animate-fade absolute inset-0 bg-black/40" onClick={() => setRunSheet(false)} />
          <div className="animate-slide-up absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
              <span className="text-sm font-semibold">{latestRun ? t('runTitle') : t('noRun')}</span>
              <button onClick={() => setRunSheet(false)} aria-label="close" className="p-1 text-neutral-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            {selectedConv && <BotToggle conv={selectedConv} />}
            <RunPanel runs={runs} flows={flows} />
          </div>
        </div>
      )}
    </div>
  );
}

/** The release valve for a handoff: hand the conversation back to the bot. */
function BotToggle({ conv }: { conv: SelectedConv }) {
  const t = useTranslations('whatsapp.inbox');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = (enabled: boolean) => startTransition(async () => {
    await setConversationBot({ conversationId: conv.id, enabled });
    router.refresh();
  });

  const active = conv.bot_enabled && !conv.handoff_at;
  return (
    <div className={cn(
      'flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-3',
      active ? 'bg-emerald-50/50' : 'bg-amber-50/60',
    )}>
      <div className="min-w-0 text-xs">
        <div className="flex items-center gap-1.5 font-semibold">
          <Bot className={cn('h-3.5 w-3.5', active ? 'text-emerald-600' : 'text-amber-600')} />
          {active ? t('botActive') : t('botPaused')}
        </div>
        {!active && (
          <p className="mt-0.5 text-neutral-500">
            {conv.handoff_by === 'staff_dashboard' ? t('pausedByStaff') : t('pausedByHandoff')}
          </p>
        )}
      </div>
      <button
        disabled={pending}
        onClick={() => toggle(!active)}
        className={cn(
          'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50',
          active
            ? 'border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-50'
            : 'bg-neutral-900 text-white hover:bg-neutral-700',
        )}
      >
        {active ? t('pauseBot') : t('resumeBot')}
      </button>
    </div>
  );
}

export function withParams(filters: InboxFilters, c: string | null): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (filters.flow) params.set('flow', filters.flow);
  if (c) params.set('c', c);
  const qs = params.toString();
  return `/whatsapp/inbox${qs ? `?${qs}` : ''}`;
}
