'use client';

import { getImageProps } from 'next/image';

/**
 * Warm the register's cache with every product photo while there is a
 * network. The service worker keeps `/_next/image` responses (sw-pos.js),
 * but only the ones the browser asked for: tiles below the fold, and any
 * variant a thumbnail would request, were never fetched, so they came up
 * blank once offline. This asks for each photo exactly as the tiles do
 * (same `sizes`, so the browser picks the same variant), a few at a time.
 */
export function precacheProductImages(urls: string[], sizes: string): () => void {
  let cancelled = false;
  const queue = [...new Set(urls)];
  const lanes = 3;
  const next = async (): Promise<void> => {
    const url = queue.shift();
    if (!url || cancelled) return;
    try {
      const { props } = getImageProps({ src: url, alt: '', fill: true, sizes });
      const img = new Image();
      if (props.sizes) img.sizes = props.sizes;
      if (props.srcSet) img.srcset = props.srcSet;
      img.src = props.src;
      await img.decode().catch(() => {});
    } catch {
      // a broken photo is the tile's problem, not the queue's
    }
    return next();
  };
  const start = () => {
    for (let i = 0; i < lanes; i++) void next();
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 5000 });
  else setTimeout(start, 1000);
  return () => {
    cancelled = true;
  };
}
