'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Send, Sparkles, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sendPartyMessage } from '@/app/host/actions';
import type { InboxMessage } from './InboxShell';

/**
 * Chat-style transcript with a reply box. Answering from here pauses the
 * bot on that chat (a person took it) — the toggle in the side panel hands
 * it back. Photos, voice notes, stickers and quoted replies show as the
 * diner sent them.
 */
export function Transcript({ messages, conversationId, onSent }: { messages: InboxMessage[]; conversationId: string | null; onSent?: () => void }) {
  const t = useTranslations('whatsapp.inbox');
  const scroller = useRef<HTMLDivElement>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, start] = useTransition();

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  function send() {
    const body = text.trim();
    if (!body || !conversationId || sending) return;
    setError(null);
    start(async () => {
      const r = await sendPartyMessage(conversationId, body);
      if (!r.ok) {
        setError(r.error === 'window_closed' ? t('windowClosed') : t('sendFailed'));
        return;
      }
      setText('');
      onSent?.();
    });
  }

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
          const quoted = m.replied_to_wa_id ? messages.find((x) => x.wa_message_id === m.replied_to_wa_id) ?? null : null;
          const sticker = m.type === 'sticker' && m.media_url;
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
                    'max-w-[70%] whitespace-pre-wrap rounded-2xl text-sm',
                    sticker ? 'bg-transparent' : inbound ? 'rounded-bl-sm border border-neutral-200 bg-white px-3 py-2' : 'rounded-br-sm bg-neutral-900 px-3 py-2 text-white',
                  )}
                >
                  {m.replied_to_wa_id && (
                    <div className={cn('mb-1.5 truncate rounded-lg border-l-2 px-2 py-1 text-xs', inbound ? 'border-emerald-500 bg-neutral-100 text-neutral-600' : 'border-white/60 bg-white/10 text-white/80')}>
                      {quoted ? summary(quoted, t) : t('quotedGone')}
                    </div>
                  )}
                  {m.media_url && m.type === 'image' && (
                    <a href={m.media_url} target="_blank" rel="noreferrer" className="mb-1 block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.media_url} alt="" className="max-h-72 w-full rounded-xl object-cover" loading="lazy" />
                    </a>
                  )}
                  {sticker && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.media_url!} alt="sticker" className="h-32 w-32 object-contain" loading="lazy" />
                  )}
                  {m.media_url && m.type === 'audio' && (
                    <audio controls preload="none" src={m.media_url} className="mb-1 h-10 w-64 max-w-full" />
                  )}
                  {m.body ? m.body : !m.media_url && <span className="italic opacity-60">{summary(m, t)}</span>}
                  <div className={cn(
                    'mt-1 flex items-center gap-1 text-[10px]',
                    inbound ? 'text-neutral-400' : 'text-neutral-300',
                  )}>
                    <OriginTag origin={m.origin} />
                    <span>·</span>
                    <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {m.status === 'failed' && <span className="text-red-400">· {t('sendFailed')}</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-neutral-200 bg-white px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            placeholder={t('replyPlaceholder')}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-xl border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10"
          />
          <button
            onClick={send}
            disabled={sending || !text.trim() || !conversationId}
            className="rounded-xl bg-neutral-900 p-2.5 text-white disabled:opacity-40"
            aria-label={t('send')}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-[11px] text-neutral-400">{error ?? t('replyHint')}</p>
      </div>
    </div>
  );
}

function summary(m: InboxMessage, t: ReturnType<typeof useTranslations>): string {
  if (m.body) return m.body;
  switch (m.type) {
    case 'image': return t('photo');
    case 'audio': return t('audio');
    case 'sticker': return 'Sticker';
    default: return t('nonText');
  }
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
