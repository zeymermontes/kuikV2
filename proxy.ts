import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';
import { ROOT_HOST, APP_SUBDOMAIN } from '@/lib/config';

/**
 * Request proxy (Next 16's successor to middleware). Routing strategy:
 *   - <sub>.kuik.mx / custom domains  → rewrite to /s/<hostKey>/...  (public menu)
 *   - app.kuik.mx, kuik.mx, localhost → dashboard + marketing (pass through,
 *     with Supabase session refresh)
 *
 * In dev, `<sub>.localhost:3000` resolves the same way (ROOT_HOST = "localhost").
 */
export async function proxy(request: NextRequest) {
  const url = request.nextUrl;
  const host = (request.headers.get('host') ?? '').split(':')[0];

  // ── Origin lock ──────────────────────────────────────────────────────────
  // Cloudflare stamps every request it proxies with `X-Kuik-Edge: <secret>`
  // (a Transform Rule on the kuik.mx zone). A request for a kuik.mx host that
  // arrives WITHOUT the stamp came straight to the Render origin, skipping the
  // edge — which is exactly how an attacker dodges Cloudflare's rate limits
  // and forges `cf-connecting-ip` to rotate ours. Refuse it.
  //
  // Scope: kuik.mx hosts only. Custom tenant domains and kuik.onrender.com
  // (Render health checks) don't pass our Cloudflare and are exempt. Inert
  // until KUIK_EDGE_SECRET is set — never set it in local dev, where
  // ROOT_HOST is "localhost" and every request would be refused.
  // The APEX is deliberately exempt: kuik.mx is an A record straight to
  // Render's IP, and on that path our Cloudflare zone's Transform Rule does
  // not stamp the header (verified in production — the apex served 403 to
  // everyone while every subdomain passed). Subdomains ride the CNAME through
  // Cloudflare-for-SaaS where the stamp demonstrably arrives, and the apex
  // only serves the marketing page; a direct-to-origin request forging
  // Host: kuik.mx dies at Render's own edge anyway.
  const edgeSecret = process.env.KUIK_EDGE_SECRET;
  if (edgeSecret && host.endsWith(`.${ROOT_HOST}`)) {
    if (request.headers.get('x-kuik-edge') !== edgeSecret) {
      return new NextResponse('Forbidden', { status: 403 });
    }
  }

  // API routes take part in the origin lock but in nothing below: no session
  // refresh (route handlers read their own cookies) and no tenant rewrite
  // (the menu calls /api/track etc. from tenant hosts as-is). This preserves
  // the behaviour from when the matcher excluded /api entirely.
  if (url.pathname.startsWith('/api')) return NextResponse.next();

  const isRoot = host === ROOT_HOST || host === `www.${ROOT_HOST}`;
  const isApp = host === `${APP_SUBDOMAIN}.${ROOT_HOST}`;

  // Dashboard / marketing host → just refresh the auth session.
  if (isRoot || isApp) {
    const { response } = await updateSession(request);
    return response;
  }

  // Otherwise this is a tenant host. Derive the host key:
  //   - subdomain of the root domain → the bare subdomain ("tacos")
  //   - anything else                → the full host (custom domain)
  let hostKey = host;
  if (host.endsWith(`.${ROOT_HOST}`)) {
    hostKey = host.slice(0, -1 * (ROOT_HOST.length + 1));
  }

  const rewriteUrl = new URL(`/s/${hostKey}${url.pathname}`, request.url);
  rewriteUrl.search = url.search;
  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  // Skip Next internals and static assets — but NOT /api: the origin lock
  // above must cover the public API routes, which are the very thing a
  // direct-to-origin attacker would aim at.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
