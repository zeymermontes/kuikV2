'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Eye, Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InboxMessage } from './InboxShell';

/**
 * Chat-style transcript, strictly read-only: staff answer from WhatsApp
 * itself, and the bar at the bottom says so instead of offering a reply box
 * that doesn't exist.
 */
export function Transcript({ messages }: { messages: InboxMessage[] }) {
  const t = useTranslations('whatsapp.inbox');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-neutral-50 p-4">
        {messages.length === 0 && (
          <p className="pt-8 text-center text-sm text-neutral-400">{t('noMessages')}</p>
        )}
        {messages.map((m, i) => {
          const day = new Date(m.created_at).toLocaleDateString();
          const showDay = i === 0 || day !== new Date(messages[i - 1].created_at).toLocaleDateString();
          const inbound = m.direction === 'inbound';
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 text-center">
                  <span className="rounded-full bg-neutral-200/70 px-3 py-1 text-[11px] text-neutral-600">{day}</span>
                </div>
              )}
              <div className={cn('flex', inbound ? 'justify-start' : 'justify-end')}>
                <div
                  className={cn(
                    'max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm',
                    inbound
                      ? 'rounded-bl-sm border border-neutral-200 bg-white'
                      : 'rounded-br-sm bg-neutral-900 text-white',
                  )}
                >
                  {m.body || <span className="italic opacity-60">{t('nonText')}</span>}
                  <div className={cn(
                    'mt-1 flex items-center gap-1 text-[10px]',
                    inbound ? 'text-neutral-400' : 'text-neutral-300',
                  )}>
                    <OriginTag origin={m.origin} />
                    <span>·</span>
                    <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-2 border-t border-neutral-200 bg-white px-4 py-2.5 text-xs text-neutral-500">
        <Eye className="h-3.5 w-3.5" /> {t('readOnly')}
      </div>
    </div>
  );
}

function OriginTag({ origin }: { origin: InboxMessage['origin'] }) {
  const t = useTranslations('whatsapp.inbox');
  switch (origin) {
    case 'bot':
      return <span className="inline-flex items-center gap-0.5"><Bot className="h-3 w-3" /> {t('originBot')}</span>;
    case 'staff_dashboard':
    case 'staff_device':
      return <span className="inline-flex items-center gap-0.5"><User className="h-3 w-3" /> {t('originStaff')}</span>;
    case 'system':
      return <span className="inline-flex items-center gap-0.5"><Sparkles className="h-3 w-3" /> {t('originSystem')}</span>;
    default:
      return <span>{t('originCustomer')}</span>;
  }
}
