'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Bot, Clock, LayoutTemplate, MessageCircle, Send, Sparkles, User } from 'lucide-react';
import { createClient, channelName } from '@/lib/supabase/client';
import { getChat, sendPartyMessage, setPartyChatBot, type PartyChat, type PartyChatMessage } from '@/app/host/actions';
import { WaTemplateModal } from '@/components/whatsapp/WaTemplateModal';
import { WaTemplatePreview } from '@/components/whatsapp/WaTemplatePreview';
import { Sheet, GHOST, PRIMARY } from './ui';

/**
 * The WhatsApp chat with one party, from the stand: what the bot and the
 * diner said, live, and a box to answer by hand. Answering pauses the bot on
 * that chat (a person took it); the header hands it back.
 */
/** Ids of bubbles shown before the server has confirmed them. */
const LOCAL_PREFIX = 'local-';

export function ChatSheet({
  partyId,
  conversationId: givenConversationId,
  byPhone,
  name,
  phone,
  onClose,
}: {
  /** Open by booking… */
  partyId?: string;
  /** …or straight by conversation (a diner waiting for a person, booking or not)… */
  conversationId?: string;
  /** …or by number (an order with a phone and no chat yet). */
  byPhone?: string;
  name: string;
  phone: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('host');
  const tt = useTranslations('waTemplate');
  const [chat, setChat] = useState<PartyChat | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [, startSend] = useTransition();
  const [, startBot] = useTransition();
  // The sheet's body is what scrolls, not our list: an anchor at the end
  // is scrolled into view on load and on every new message.
  const bottom = useRef<HTMLDivElement>(null);
  const conversationId = chat?.conversationId ?? null;

  useEffect(() => {
    let cancelled = false;
    getChat({ partyId, conversationId: givenConversationId, phone: byPhone })
      .then((c) => !cancelled && setChat(c))
      .catch(() => !cancelled && setChat({ conversationId: null, messages: [], botActive: true, canReply: false, reason: 'no_conversation', canTemplate: false, href: null }));
    return () => {
      cancelled = true;
    };
  }, [partyId, givenConversationId, byPhone]);

  // New messages (the diner's reply, the bot's answer) land as they happen.
  useEffect(() => {
    if (!conversationId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(`host-chat-${conversationId}`))
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const row = payload.new as PartyChatMessage;
          setChat((cur) => {
            if (!cur || cur.messages.some((m) => m.id === row.id)) return cur;
            // The row for a message this sheet just sent: it takes the place
            // of the local bubble instead of showing up twice.
            const local = row.direction === 'outbound' && row.origin === 'staff_dashboard'
              ? cur.messages.findIndex((m) => m.id.startsWith(LOCAL_PREFIX) && m.body === row.body)
              : -1;
            const messages = local >= 0 ? cur.messages.map((m, i) => (i === local ? row : m)) : [...cur.messages, row];
            return { ...cur, messages };
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [chat?.messages]);

  function send() {
    const body = text.trim();
    if (!body || !conversationId) return;
    setError(null);
    // Optimistic: the field clears and the bubble shows the moment the
    // button is tapped, not when the server action comes back. The real row
    // arrives over Realtime and replaces the local one; the bot state changed
    // server-side. On failure the text comes back so nothing typed is lost.
    const local: PartyChatMessage = {
      id: `${LOCAL_PREFIX}${Date.now()}`,
      wa_message_id: null,
      direction: 'outbound',
      origin: 'staff_dashboard',
      type: 'text',
      body,
      media_url: null,
      media_mime: null,
      replied_to_wa_id: null,
      status: 'queued',
      created_at: new Date().toISOString(),
    };
    setText('');
    setChat((cur) => (cur ? { ...cur, botActive: false, messages: [...cur.messages, local] } : cur));
    startSend(async () => {
      let r: Awaited<ReturnType<typeof sendPartyMessage>>;
      try {
        r = await sendPartyMessage(conversationId, body);
      } catch {
        r = { ok: false };
      }
      if (r.ok) return;
      setChat((cur) => (cur ? { ...cur, messages: cur.messages.filter((m) => m.id !== local.id) } : cur));
      setText((cur) => (cur.trim() ? cur : body));
      if (r.error === 'window_closed') {
        // Our copy of the window was stale: the composer gives way to the
        // template picker, which is the only thing WhatsApp will deliver now.
        setChat((cur) => (cur ? { ...cur, canReply: false, reason: 'window_closed' } : cur));
        if (chat?.canTemplate) setTemplateOpen(true);
        else setError(t('chatWindowClosed'));
      } else {
        setError(t('chatFailed'));
      }
    });
  }

  /** The template just sent, as a bubble until Realtime brings the real row. */
  function templateSent(sent: { body: string; template: NonNullable<NonNullable<PartyChatMessage['payload']>['template']> }) {
    const local: PartyChatMessage = {
      id: `${LOCAL_PREFIX}${Date.now()}`,
      wa_message_id: null,
      direction: 'outbound',
      origin: 'staff_dashboard',
      type: 'template',
      body: sent.body,
      media_url: null,
      media_mime: null,
      replied_to_wa_id: null,
      payload: { template: sent.template },
      status: 'queued',
      created_at: new Date().toISOString(),
    };
    setChat((cur) => (cur ? { ...cur, botActive: false, messages: [...cur.messages, local] } : cur));
  }

  const [askingResume, setAskingResume] = useState(false);
  // The diner spoke last: resuming the bot can also mean answering them.
  const pendingReply = Boolean(chat && chat.messages.length > 0 && chat.messages[chat.messages.length - 1].direction === 'inbound');

  function toggleBot(enabled: boolean, answer = false) {
    if (!conversationId) return;
    setAskingResume(false);
    setChat((cur) => (cur ? { ...cur, botActive: enabled } : cur));
    startBot(() => setPartyChatBot(conversationId, enabled, answer));
  }

  const footer = chat && (
    <div className="space-y-2">
      {chat.conversationId && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className={`flex items-center gap-1.5 ${chat.botActive ? 'text-emerald-300' : 'text-amber-300'}`}>
            <Bot className="h-3.5 w-3.5" /> {chat.botActive ? t('botActive') : t('botPaused')}
          </span>
          {!chat.botActive && askingResume ? (
            <span className="flex flex-wrap items-center justify-end gap-1.5">
              <span className="text-white/60">{t('resumeAsk')}</span>
              <button onClick={() => toggleBot(true, true)} className="rounded-full bg-white px-2.5 py-1 font-semibold text-black">{t('resumeAndAnswer')}</button>
              <button onClick={() => toggleBot(true, false)} className="rounded-full border border-white/15 px-2.5 py-1 font-semibold text-white/80 hover:bg-white/10">{t('resumeOnly')}</button>
            </span>
          ) : (
            <button
              onClick={() => (chat.botActive ? toggleBot(false) : pendingReply ? setAskingResume(true) : toggleBot(true))}
              className="rounded-full border border-white/15 px-2.5 py-1 font-semibold text-white/80 hover:bg-white/10"
            >
              {chat.botActive ? t('pauseBot') : t('resumeBot')}
            </button>
          )}
        </div>
      )}
      {chat.canReply ? (
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
            rows={2}
            placeholder={t('chatPlaceholder')}
            className="min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-base text-white placeholder:text-white/30 focus:border-pos-accent focus:outline-none"
          />
          <button onClick={send} disabled={!text.trim()} className={`${PRIMARY} !px-3`} aria-label={t('chatSend')}>
            <Send className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-white/50">
            {chat.reason === 'window_closed' ? (chat.canTemplate ? tt('windowClosed') : t('chatWindowClosed')) : t('chatNoConversation')}
          </p>
          {chat.reason === 'window_closed' && chat.canTemplate && chat.conversationId && (
            <button onClick={() => setTemplateOpen(true)} className={`${PRIMARY} w-full`}>
              <LayoutTemplate className="h-4 w-4" /> {tt('sendTemplate')}
            </button>
          )}
          {chat.href && (
            <a href={chat.href} target="_blank" rel="noreferrer" className={`${GHOST} w-full bg-green-600/20 text-green-300`}>
              <MessageCircle className="h-4 w-4" /> {t('chatOpenWhatsapp')}
            </a>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );

  return (
    <Sheet title={name} subtitle={phone ?? t('chatTitle')} onClose={onClose} footer={footer}>
      {templateOpen && conversationId && (
        <WaTemplateModal conversationId={conversationId} onClose={() => setTemplateOpen(false)} onSent={templateSent} manageHref={null} />
      )}
      {chat === null ? (
        <p className="py-10 text-center text-sm text-white/50">…</p>
      ) : (
        <div className="space-y-1.5">
          {chat.messages.length === 0 && <p className="py-10 text-center text-sm text-white/50">{t('chatEmpty')}</p>}
          {chat.messages.map((m, i) => {
            const day = new Date(m.created_at).toLocaleDateString();
            const showDay = i === 0 || day !== new Date(chat.messages[i - 1].created_at).toLocaleDateString();
            const inbound = m.direction === 'inbound';
            const quoted = m.replied_to_wa_id ? chat.messages.find((x) => x.wa_message_id === m.replied_to_wa_id) ?? null : null;
            const sticker = m.type === 'sticker' && m.media_url;
            const tpl = m.payload?.template ?? null;
            return (
              <div key={m.id}>
                {showDay && (
                  <div className="my-3 text-center">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-white/60">{day}</span>
                  </div>
                )}
                <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl text-sm ${
                      sticker || tpl ? 'bg-transparent' : `px-3 py-2 ${inbound ? 'rounded-bl-sm bg-white/10 text-white' : 'rounded-br-sm bg-pos-accent text-pos-accent-text'}`
                    } ${m.id.startsWith(LOCAL_PREFIX) ? 'opacity-70' : ''}`}
                  >
                    {m.replied_to_wa_id && (
                      <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs ${inbound ? 'border-emerald-300 bg-black/20 text-white/70' : 'border-white/60 bg-black/10 opacity-80'}`}>
                        <div className="truncate">{quoted ? summary(quoted, t) : t('chatQuotedGone')}</div>
                      </div>
                    )}
                    {m.media_url && m.type === 'image' && (
                      <a href={m.media_url} target="_blank" rel="noreferrer" className="mb-1 block">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={m.media_url} alt="" className="max-h-64 w-full rounded-xl object-cover" loading="lazy" />
                      </a>
                    )}
                    {sticker && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.media_url!} alt="sticker" className="h-32 w-32 object-contain" loading="lazy" />
                    )}
                    {m.media_url && m.type === 'audio' && (
                      <audio controls preload="none" src={m.media_url} className="mb-1 h-10 w-56 max-w-full" />
                    )}
                    {tpl ? (
                      // The template as the diner saw it: header, footer and buttons included.
                      <WaTemplatePreview compact header={tpl.header} body={m.body ?? ''} footer={tpl.footer} buttons={tpl.buttons} />
                    ) : m.body
                      ? m.body
                      : !m.media_url && <span className="italic opacity-60">{summary(m, t)}</span>}
                    <div className={`mt-1 flex items-center gap-1 text-[10px] ${inbound ? 'text-white/40' : tpl ? 'text-white/50' : 'opacity-60'}`}>
                      <Origin origin={m.origin} />
                      <span>·</span>
                      <span>{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {m.id.startsWith(LOCAL_PREFIX) && <Clock className="h-3 w-3" aria-label={t('chatSending')} />}
                      {m.status === 'failed' && <span className="text-red-300">· {t('chatFailed')}</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={bottom} />
        </div>
      )}
    </Sheet>
  );
}

/** One line for a message shown as a quote or a placeholder: its text, or what kind of thing it was. */
function summary(m: PartyChatMessage, t: ReturnType<typeof useTranslations>): string {
  if (m.body) return m.body;
  switch (m.type) {
    case 'image': return t('chatPhoto');
    case 'audio': return t('chatAudio');
    case 'sticker': return t('chatSticker');
    default: return t('chatNonText');
  }
}

function Origin({ origin }: { origin: PartyChatMessage['origin'] }) {
  const t = useTranslations('host');
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
