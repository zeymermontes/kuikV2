import { NextResponse, type NextRequest } from 'next/server';
import { sniffImageType } from '@/lib/media/sniff';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * A bucket SVG or GIF, served under the content type its bytes say.
 *
 * With a custom image loader Next switches its own /_next/image route off,
 * and that route was what quietly fixed the menu importer's mistake: category
 * icons stored as SVG under image/jpeg. Handed that label directly, a browser
 * shows a broken image (SVG is never sniffed, on purpose). This does the same
 * job for those two formats only — no decoding, no resizing, a few KB each —
 * and the loader (lib/image-loader.ts) points them here.
 *
 * Only our own bucket's public objects, and only small ones: this is not a
 * general proxy.
 */

const MAX_BYTES = 2 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const src = req.nextUrl.searchParams.get('src') ?? '';
  const base = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')}/storage/v1/object/public/`;
  if (!base.startsWith('https://') || !src.startsWith(base) || !/\.(svg|gif)(\?.*)?$/i.test(src)) {
    return new Response(null, { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(src, { signal: AbortSignal.timeout(10_000), next: { revalidate: 3600 } });
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!upstream.ok) return new Response(null, { status: upstream.status === 404 ? 404 : 502 });
  if (Number(upstream.headers.get('content-length') || 0) > MAX_BYTES) return new Response(null, { status: 413 });

  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.length > MAX_BYTES) return new Response(null, { status: 413 });

  const type = sniffImageType(bytes) ?? upstream.headers.get('content-type') ?? 'application/octet-stream';
  const headers: Record<string, string> = {
    'content-type': type,
    // Objects are named by uuid and never edited in place.
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  };
  if (type === 'image/svg+xml') {
    // The same fence the built-in route put around SVGs: no scripts, no
    // rendering as a page.
    headers['content-security-policy'] = "default-src 'self'; script-src 'none'; sandbox;";
    headers['content-disposition'] = 'inline';
  }
  return new NextResponse(bytes, { status: 200, headers });
}
