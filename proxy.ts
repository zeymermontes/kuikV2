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
  // Skip Next internals, API routes, and static assets.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
