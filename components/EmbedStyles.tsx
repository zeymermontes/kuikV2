'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};
const embedded = () => window.self !== window.top;

/**
 * When this page is shown inside another page's iframe (the landing's phone
 * and tablet frames, components/landing/DeviceFrame.tsx), hide its own
 * scrollbar. Some browsers, Chrome on Android among them, reserve a classic
 * scrollbar gutter inside iframes even though the main frame uses overlay
 * scrollbars, and the page then lays out a scrollbar's width narrower than
 * the screen it is meant to fill. Scrolling itself is untouched.
 */
export function EmbedStyles() {
  const inFrame = useSyncExternalStore(noop, embedded, () => false);
  if (!inFrame) return null;
  return <style>{`html{scrollbar-width:none;scrollbar-gutter:auto}html::-webkit-scrollbar{display:none;width:0;height:0}`}</style>;
}
