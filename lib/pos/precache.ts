'use client';

import { getImageProps } from 'next/image';

/**
 * Warm the register's cache with every product photo while there is a
 * network. The service worker keeps the photo responses (sw-pos.js), but
 * only the ones the browser asked for: tiles below the fold, and any variant
 * a thumbnail would request, were never fetched, so they came up blank once
 * offline. This asks for each photo exactly as the tiles do (same `sizes`, so
 * the browser picks the same variant), a few at a time.
 *
 * The worker stores whatever passes through it, so the only thing that
 * matters here is that the requests DO pass through it: on a first visit the
 * worker is still installing when the sale screen mounts, and photos asked
 * before it controls the page would be fetched and thrown away. So the queue
 * waits for the worker (a few seconds at most; a browser without one simply
 * warms the HTTP cache).
 */
async function workerInControl(timeoutMs: number): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (navigator.serviceWorker.controller) return;
  await new Promise<void>((resolve) => {
    const done = () => {
      navigator.serviceWorker.removeEventListener('controllerchange', done);
      resolve();
    };
    navigator.serviceWorker.addEventListener('controllerchange', done);
    setTimeout(done, timeoutMs);
  });
}

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
      img.crossOrigin = 'anonymous';
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
    void workerInControl(8000).then(() => {
      for (let i = 0; i < lanes; i++) void next();
    });
  };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 5000 });
  else setTimeout(start, 1000);
  return () => {
    cancelled = true;
  };
}
