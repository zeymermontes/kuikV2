'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

// The customer-facing screen (app/pos/customer) mirrors the sale the cashier
// is building. When both windows run in the same browser on the same device —
// a dual-screen POS, a tablet with an HDMI display, a second tab — a
// BroadcastChannel carries it: no server round trip, and it keeps working
// offline like the rest of the terminal.
//
// A screen on a SEPARATE device (an iPad facing the guest, an Android box on
// an HDMI display) cannot hear a BroadcastChannel, so the terminal also
// broadcasts the same state through a private Supabase Realtime channel named
// after the register. Both sides must be signed in as staff: the policies in
// migration 0065 gate the topic on can_operate_pos(tenant).

export type DisplayPhase = 'idle' | 'sale' | 'paying' | 'paid';

export interface DisplayLine {
  id: string;
  name: string;
  qty: number;
  total: number;
  options: string;
  image: string | null;
}

export interface DisplayState {
  phase: DisplayPhase;
  /** Table or tab name, when the sale has one. */
  label: string | null;
  lines: DisplayLine[];
  subtotal: number;
  discount: number;
  tip: number;
  total: number;
  /** Set while paying / after payment. */
  due?: number;
  paid?: number;
  change?: number;
  method?: string;
  at: number;
}

export interface DisplayBrand {
  name: string;
  logoUrl: string | null;
  slogan: string | null;
  currency: string;
  locale: string;
}

type Message =
  | { type: 'state'; state: DisplayState; brand: DisplayBrand }
  | { type: 'hello' };

export const IDLE_STATE: DisplayState = {
  phase: 'idle',
  label: null,
  lines: [],
  subtotal: 0,
  discount: 0,
  tip: 0,
  total: 0,
  at: 0,
};

/** One channel per tenant; the demo previews get their own so they never leak into a live display. */
export function displayChannelName(scope: string): string {
  return `kuik-pos-display:${scope}`;
}

/** A register the remote screen follows: `?screen=<register>` on the display, the terminal's register name on the other side. */
export interface RemoteScope {
  tenantId: string;
  register: string;
}

export const DEFAULT_REGISTER = 'caja';

/** Topic-safe register key: lowercase, dashes, nothing a URL or a policy would trip on. */
export function registerSlug(name: string): string {
  const s = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || DEFAULT_REGISTER;
}

export function remoteTopic(r: RemoteScope): string {
  return `pos-display:${r.tenantId}:${registerSlug(r.register)}`;
}

type RemotePayload = { state: DisplayState; brand: DisplayBrand };

/**
 * Join the register's private channel. The browser client is a singleton and
 * hands back an existing channel of the same topic (a remount, React's dev
 * double-invoke); that one may still be tearing down, so it is removed first.
 */
function openRemote(r: RemoteScope): RealtimeChannel {
  const supabase = createClient();
  const topic = remoteTopic(r);
  for (const ch of supabase.getChannels()) if (ch.topic === `realtime:${topic}`) supabase.removeChannel(ch);
  return supabase.channel(topic, { config: { private: true, broadcast: { self: false, ack: false } } });
}

function openChannel(scope: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(displayChannelName(scope));
}

/**
 * Cashier side. Returns `publish(state)`; the latest state is re-sent whenever
 * a display window says hello, so a screen opened mid-sale catches up at once.
 */
export function useDisplayPublisher(scope: string, brand: DisplayBrand, remote?: RemoteScope | null): (state: DisplayState) => void {
  const channel = useRef<BroadcastChannel | null>(null);
  const remoteCh = useRef<RealtimeChannel | null>(null);
  const remoteLive = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef<DisplayState>(IDLE_STATE);
  const brandRef = useRef(brand);
  useEffect(() => {
    brandRef.current = brand;
  }, [brand]);

  const sendRemote = useCallback(() => {
    if (!remoteLive.current || !remoteCh.current) return;
    const payload: RemotePayload = { state: last.current, brand: brandRef.current };
    remoteCh.current.send({ type: 'broadcast', event: 'state', payload });
  }, []);

  const tenantId = remote?.tenantId ?? null;
  const register = remote ? registerSlug(remote.register) : null;
  useEffect(() => {
    if (!tenantId || !register) return;
    const ch = openRemote({ tenantId, register });
    remoteCh.current = ch;
    ch.on('broadcast', { event: 'hello' }, () => sendRemote()).subscribe((status) => {
      remoteLive.current = status === 'SUBSCRIBED';
      if (remoteLive.current) sendRemote();
    });
    return () => {
      remoteLive.current = false;
      remoteCh.current = null;
      createClient().removeChannel(ch);
    };
  }, [tenantId, register, sendRemote]);

  useEffect(() => {
    const ch = openChannel(scope);
    channel.current = ch;
    if (!ch) return;
    ch.onmessage = (e: MessageEvent<Message>) => {
      if (e.data?.type === 'hello') ch.postMessage({ type: 'state', state: last.current, brand: brandRef.current } satisfies Message);
    };
    return () => {
      ch.close();
      channel.current = null;
    };
  }, [scope]);

  return useCallback(
    (state: DisplayState) => {
      last.current = state;
      channel.current?.postMessage({ type: 'state', state, brand: brandRef.current } satisfies Message);
      // Every keystroke on the terminal changes the state; the wire gets the
      // trailing edge only, so a fast cashier is a few messages, not hundreds.
      if (remoteCh.current) {
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(sendRemote, 120);
      }
    },
    [sendRemote],
  );
}

export type DisplayLink = 'local' | 'connecting' | 'live';

/**
 * Display side. Calls `onState` with every update and asks for the current
 * one on mount. With `remote` it also follows the register over Realtime and
 * reports whether that link is up, so the screen can say "connecting".
 */
export function useDisplaySubscriber(
  scope: string,
  onState: (state: DisplayState, brand: DisplayBrand) => void,
  remote?: RemoteScope | null,
): DisplayLink {
  const cb = useRef(onState);
  const [link, setLink] = useState<DisplayLink>(remote ? 'connecting' : 'local');
  useEffect(() => {
    cb.current = onState;
  }, [onState]);
  useEffect(() => {
    const ch = openChannel(scope);
    if (!ch) return;
    ch.onmessage = (e: MessageEvent<Message>) => {
      if (e.data?.type === 'state') cb.current(e.data.state, e.data.brand);
    };
    ch.postMessage({ type: 'hello' } satisfies Message);
    return () => ch.close();
  }, [scope]);

  const tenantId = remote?.tenantId ?? null;
  const register = remote ? registerSlug(remote.register) : null;
  useEffect(() => {
    if (!tenantId || !register) return;
    const ch = openRemote({ tenantId, register });
    ch.on('broadcast', { event: 'state' }, ({ payload }) => {
      const p = payload as RemotePayload;
      if (p?.state) cb.current(p.state, p.brand);
    }).subscribe((status) => {
      const live = status === 'SUBSCRIBED';
      setLink(live ? 'live' : 'connecting');
      if (live) ch.send({ type: 'broadcast', event: 'hello', payload: {} });
    });
    return () => {
      createClient().removeChannel(ch);
    };
  }, [tenantId, register]);
  return link;
}

export type OpenResult = 'second-screen' | 'window' | 'blocked';

interface ScreenDetailed {
  isPrimary: boolean;
  availLeft: number;
  availTop: number;
  availWidth: number;
  availHeight: number;
}

/**
 * Open the customer display. With the Window Management API (Chrome/Edge on a
 * device with two screens) the window lands on the secondary screen, sized to
 * it; elsewhere it opens as a popup the cashier drags across once. The window
 * is named, so calling again focuses the one already open instead of stacking.
 */
export async function openCustomerScreen(url: string): Promise<OpenResult> {
  const w = window as Window & { getScreenDetails?: () => Promise<{ screens: ScreenDetailed[] }> };
  try {
    if (w.getScreenDetails) {
      const details = await w.getScreenDetails();
      const other = details.screens.find((s) => !s.isPrimary);
      if (other) {
        const win = window.open(
          url,
          'kuik-pos-customer',
          `popup,left=${other.availLeft},top=${other.availTop},width=${other.availWidth},height=${other.availHeight}`,
        );
        if (win) {
          win.focus();
          return 'second-screen';
        }
      }
    }
  } catch {
    // Permission denied or API missing: fall through to a plain popup.
  }
  const win = window.open(url, 'kuik-pos-customer', 'popup,width=1024,height=640');
  if (!win) return 'blocked';
  win.focus();
  return 'window';
}

/** True when the browser can send a page to a cast / wired display via the Presentation API. */
export function canPresent(): boolean {
  return typeof window !== 'undefined' && 'PresentationRequest' in window;
}

/** Present the display through the browser's screen picker (Chromecast, Miracast, wired). */
export async function presentCustomerScreen(url: string): Promise<boolean> {
  try {
    const Req = (window as Window & { PresentationRequest?: new (urls: string[]) => { start: () => Promise<unknown> } }).PresentationRequest;
    if (!Req) return false;
    await new Req([url]).start();
    return true;
  } catch {
    return false;
  }
}
