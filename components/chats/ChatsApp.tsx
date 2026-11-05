'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ArrowLeft, Bot, ExternalLink, Headset, MessageCircle, Search, X } from 'lucide-react';
import { createClient, channelName } from '@/lib/supabase/client';
import { closeChat, listChats, type ChatRow } from '@/app/chats/actions';
import { HUB_PATH } from '@/lib/native/back';
import { ChatSheet } from '@/components/host/ChatSheet';
import { chatTone, chatsFor, type ChatTone } from '@/lib/chats/list';

// Yellow: the diner is waiting on the restaurant. Blue: the restaurant
// answered and it is the diner's turn. Grey: nobody is waited for.
const TONE: Record<ChatTone, string> = {
  needsReply: 'bg-amber-500 text-white',
  answered: 'bg-blue-500 text-white',
  idle: 'bg-white/10 text-white/70',
};

/**
 * One list, two filters: the chats waiting for a person, and everybody,
 * both newest first. Every row says who has it: a person is awaited, or the
 * bot is answering. Tapping a row opens the same chat panel the host stand
 * uses, so a reply here and a reply at the door are the same thing; the X
 * takes a finished chat off the list (closeChat). The list refreshes on
 * every new message and every handoff, over Realtime.
 */
export function ChatsApp({
  tenantId,
  tenantName,
  logoUrl,
  initial,
  openChat = null,
  themeStyle,
  adminLink = true,
}: {
  tenantId: string;
  /** The shortcut into the admin panel's inbox. Off for a shared device (0100). */
  adminLink?: boolean;
  tenantName: string;
  logoUrl: string | null;
  initial: { rows: ChatRow[]; connected: boolean };
  /** A chat to open straight away (opened by link). */
  openChat?: ChatRow | null;
  themeStyle?: React.CSSProperties;
}) {
  const t = useTranslations('chats');
  const [rows, setRows] = useState<ChatRow[]>(initial.rows);
  const [connected] = useState(initial.connected);
  const [view, setView] = useState<'waiting' | 'all'>(initial.rows.some((r) => r.waiting) ? 'waiting' : 'all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<ChatRow | null>(openChat);
  const [now, setNow] = useState(() => Date.now());
  const queryRef = useRef(query);
  useEffect(() => { queryRef.current = query; }, [query]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const refresh = useCallback(() => {
    listChats(queryRef.current).then((r) => setRows(r.rows)).catch(() => {});
  }, []);

  // Search runs server-side (it reaches contacts the first page does not hold).
  useEffect(() => {
    const id = setTimeout(refresh, query ? 250 : 0);
    return () => clearTimeout(id);
  }, [query, refresh]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(channelName(`chats-${tenantId}`))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'whatsapp_messages', filter: `tenant_id=eq.${tenantId}` }, refresh)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'whatsapp_conversations', filter: `tenant_id=eq.${tenantId}` }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tenantId, refresh]);

  // Off the list at once; the server follows. If it fails, the next refresh
  // (any message, any handoff) puts the row back.
  function remove(r: ChatRow) {
    if (!window.confirm(t(r.waiting ? 'removeConfirmWaiting' : 'removeConfirm', { name: r.name }))) return;
    setRows((cur) => cur.filter((x) => x.conversationId !== r.conversationId));
    closeChat(r.conversationId).then((res) => !res.ok && refresh()).catch(refresh);
  }

  const waitingCount = rows.filter((r) => r.waiting).length;
  // Each view has its own order (lib/chats/list.ts): recent is by time, not waiting-first.
  const visible = useMemo(() => chatsFor(rows, view), [rows, view]);

  const ago = (iso: string) => {
    const mins = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
    return mins < 1 ? 'ahora' : mins < 60 ? `${mins} min` : mins < 1440 ? `${Math.round(mins / 60)} h` : `${Math.round(mins / 1440)} d`;
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-pos-dark text-white" style={themeStyle}>
      <header className="border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2">
          {/* The launcher every section is opened from. Android's back button does the same inside the apps. */}
          <Link href={HUB_PATH} prefetch={true} className="-ml-1 rounded-lg p-2 text-white/70 hover:bg-white/5 hover:text-white" title={t('back')} aria-label={t('back')}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-8 w-8 rounded-lg bg-white object-cover" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pos-accent text-sm font-black text-pos-accent-text">K</span>
          )}
          <span className="hidden max-w-[160px] truncate text-sm font-bold sm:block">{tenantName}</span>
          <span className="flex items-center gap-1.5 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-white/60" /> {t('title')}</span>
          {adminLink && (
            <Link href="/whatsapp/inbox" className="ml-auto rounded-lg bg-white/5 p-2 text-white/70 hover:text-white" title="Inbox">
              <ExternalLink className="h-4 w-4" />
            </Link>
          )}
        </div>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('search')}
            className="h-9 w-full rounded-lg bg-white/5 pl-8 pr-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-pos-accent/50"
          />
        </div>
        <div className="mt-2 flex gap-2" role="radiogroup" aria-label={t('title')}>
          {(['waiting', 'all'] as const).map((v) => {
            const active = view === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setView(v)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  active ? 'bg-white text-black' : 'border border-white/15 text-neutral-300 hover:bg-white/10'
                }`}
              >
                {v === 'waiting' && <Headset className="h-3.5 w-3.5" />}
                {t(v === 'waiting' ? 'filterHelp' : 'filterAll')}
                {v === 'waiting' && waitingCount > 0 && (
                  <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white">{waitingCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {!connected && <p className="m-3 rounded-xl bg-amber-400/10 p-3 text-sm text-amber-200">{t('noWhatsapp')}</p>}
        {visible.length === 0 ? (
          <p className="py-16 text-center text-sm text-white/50">{view === 'waiting' ? t('emptyWaiting') : t('empty')}</p>
        ) : (
          <ul className="divide-y divide-white/5 md:mx-auto md:max-w-3xl">
            {visible.map((r) => (
              <li key={r.conversationId} className="flex items-stretch hover:bg-white/5">
                <button onClick={() => setOpen(r)} className="flex min-w-0 flex-1 items-start gap-3 py-3 pl-3 text-left">
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONE[chatTone(r)]}`}>
                    {r.waiting ? <Headset className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate font-semibold">{r.name}</span>
                      {r.lastAt && <span className="shrink-0 text-xs text-white/40">{ago(r.lastAt)}</span>}
                    </span>
                    <span className={`block truncate text-sm ${r.lastInbound ? 'text-white/80' : 'text-white/50'}`}>
                      {!r.lastInbound && <Bot className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />}
                      {r.lastText ?? '…'}
                    </span>
                    {r.waiting && r.since && <span className="mt-0.5 block text-xs text-amber-300">{t('waitingSince', { x: ago(r.since) })}</span>}
                    {r.botActive && (
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-emerald-300">
                        <Bot className="h-3 w-3" /> {t('botAttending')}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(r)}
                  title={t('remove')}
                  aria-label={`${t('remove')}: ${r.name}`}
                  className="shrink-0 px-3 text-white/25 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>

      {open && (
        <ChatSheet
          conversationId={open.conversationId}
          name={open.name}
          phone={open.phone}
          onClose={() => {
            setOpen(null);
            // Opened by link: a reload should show the list, not the chat again.
            if (window.location.search) window.history.replaceState(null, '', window.location.pathname);
            refresh();
          }}
        />
      )}
    </div>
  );
}
