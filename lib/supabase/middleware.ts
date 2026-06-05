import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Refreshes the Supabase auth session cookie. Performance notes:
 *   - If there's no Supabase auth cookie at all (logged-out / public visitor),
 *     we skip creating a client and making any network call entirely.
 *   - We use getSession() rather than getUser(): when the access token is still
 *     valid this reads the cookie WITHOUT a network round-trip, and only calls
 *     Supabase to refresh when the token is actually expired. Signature
 *     verification (authorization) is done per-page in requireUser via
 *     getClaims(), so this is safe.
 */
export async function updateSession(request: NextRequest) {
  // Fast path: no auth cookie → nothing to refresh, don't touch the network.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-'));
  if (!hasAuthCookie) {
    return { response: NextResponse.next({ request }), user: null };
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refreshes the token (and rewrites cookies) only when expired.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { response, user: session?.user ?? null };
}
