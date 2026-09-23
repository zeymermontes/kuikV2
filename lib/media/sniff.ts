/**
 * What an image file actually is, read from its first bytes.
 *
 * Both importers used to trust a label — the remote server's content-type,
 * or a guess from the file name — and stored SVG category icons as
 * image/jpeg. Served straight from the bucket, a browser shows those as a
 * broken image. The bytes do not lie; the label is only a fallback for a
 * format this does not know.
 *
 * Plain Uint8Array in and out, so it runs in the browser (the ZIP importer)
 * and on the server (the URL importer) alike.
 */

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' | 'image/svg+xml';

export const EXT_BY_MIME: Record<ImageMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
};

const ascii = (b: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...b.subarray(from, Math.min(to, b.length)));

export function sniffImageType(bytes: Uint8Array): ImageMime | null {
  if (bytes.length < 4) return null;
  const [a, b, c, d] = bytes;
  if (a === 0x89 && b === 0x50 && c === 0x4e && d === 0x47) return 'image/png';
  if (a === 0xff && b === 0xd8 && c === 0xff) return 'image/jpeg';
  if (ascii(bytes, 0, 4) === 'GIF8') return 'image/gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'image/webp';
  // SVG is text: an XML prologue or the root element somewhere near the top,
  // after any BOM, whitespace or comment.
  const head = ascii(bytes, 0, 512).replace(/^﻿/, '').trimStart();
  if (head.startsWith('<?xml') || head.startsWith('<svg') || /<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}
