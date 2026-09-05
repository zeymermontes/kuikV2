'use client';

import { useCallback, useEffect, useRef } from 'react';

// The customer-facing screen (app/pos/customer) mirrors the sale the cashier
// is building. Both windows run in the same browser on the same device — a
// dual-screen POS, a tablet with an HDMI display, or a second browser tab —
// so a BroadcastChannel is all that is needed: no server round trip, and it
// keeps working offline like the rest of the terminal.

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

function openChannel(scope: string): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  return new BroadcastChannel(displayChannelName(scope));
}

/**
 * Cashier side. Returns `publish(state)`; the latest state is re-sent whenever
 * a display window says hello, so a screen opened mid-sale catches up at once.
 */
export function useDisplayPublisher(scope: string, brand: DisplayBrand): (state: DisplayState) => void {
  const channel = useRef<BroadcastChannel | null>(null);
  const last = useRef<DisplayState>(IDLE_STATE);
  const brandRef = useRef(brand);
  useEffect(() => {
    brandRef.current = brand;
  }, [brand]);

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

  return useCallback((state: DisplayState) => {
    last.current = state;
    channel.current?.postMessage({ type: 'state', state, brand: brandRef.current } satisfies Message);
  }, []);
}

/** Display side. Calls `onState` with every update and asks for the current one on mount. */
export function useDisplaySubscriber(scope: string, onState: (state: DisplayState, brand: DisplayBrand) => void): void {
  const cb = useRef(onState);
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
