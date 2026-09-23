'use client';

import type { ImageLoaderProps } from 'next/image';

/**
 * Every `next/image` goes through here (next.config `images.loaderFile`).
 *
 * Photos in the media bucket are resized by Supabase's image transformation
 * endpoint and served from its CDN, instead of by this server's own optimiser.
 * That takes the resizer — the one component that reserves memory outside
 * Node's heap and never gives it back — out of the web process entirely, and
 * puts the photos on a CDN edge instead of a single Render instance.
 *
 * An SVG or GIF in the bucket (uploaded as-is; the transformer refuses them)
 * goes through our own small route, which serves it under the type its bytes
 * say. That matters because the menu importer stored category icons as SVG
 * under an image/jpeg content type, and a browser handed that file directly
 * shows a broken image. The built-in /_next/image route used to hide that,
 * but Next switches it off once a custom loader is configured.
 *
 * Anything else comes back untouched: a path under /public, a foreign host.
 */

const OBJECT = '/storage/v1/object/public/';
const RENDER = '/storage/v1/render/image/public/';
/** Supabase caps a transform at this width; larger asks are rejected, not clamped. */
const MAX_WIDTH = 2500;
const PASSTHROUGH = /\.(svg|gif)(\?.*)?$/i;

export default function supabaseImageLoader({ src, width, quality }: ImageLoaderProps): string {
  if (!src.includes(OBJECT)) return src;
  if (PASSTHROUGH.test(src)) return `/api/media/raw?src=${encodeURIComponent(src)}`;
  const base = src.replace(OBJECT, RENDER);
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}width=${Math.min(width, MAX_WIDTH)}&quality=${quality ?? 75}`;
}
