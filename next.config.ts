import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const supabaseHost = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  // Pin the workspace root (a stray lockfile in $HOME otherwise confuses inference).
  turbopack: { root: import.meta.dirname },
  // Custom-landing zips are posted to a Server Action; the default body cap is 1MB.
  experimental: { serverActions: { bodySizeLimit: '15mb' } },
  // Next keeps rendered pages and fetch results in an in-process LRU (50 MB by
  // default) on top of the on-disk cache. On a 512 MB instance that is a tenth
  // of everything; the disk copy makes the memory one a convenience, not a need.
  cacheMaxMemorySize: 16 * 1024 * 1024,
  images: {
    // Photos are resized by Supabase's transformation endpoint and served from
    // its CDN (lib/image-loader.ts), not by this server's optimiser: the
    // resizer's libvips buffers live outside Node's heap and were the biggest
    // slice of memory that never came back. The options below still govern
    // the built-in /_next/image route, which stays reachable.
    loader: 'custom',
    loaderFile: './lib/image-loader.ts',
    // Category icons are often SVG. Serving them through the optimiser needs
    // this flag; the CSP below strips scripting, and `attachment` stops the
    // optimiser URL from being used to render an SVG as a page.
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Only OUR Supabase project. The optimizer is unauthenticated and CPU-heavy
    // (each unique url+w+q is a fresh transcode), so a wildcard here let anyone
    // resize images from ANY *.supabase.co project through our server. The
    // wildcard survives only as a fallback for a dev env with no URL configured.
    remotePatterns: [
      supabaseHost
        ? { protocol: 'https' as const, hostname: supabaseHost }
        : { protocol: 'https' as const, hostname: '*.supabase.co' },
    ],
  },
};

export default withNextIntl(nextConfig);
