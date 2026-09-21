import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { loadUser, getMemberships } from '@/lib/auth';
import type { MemberRole } from '@/lib/database.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Where a notification lands: /open?t=<tenant>&to=<path>.
 *
 * A push belongs to one restaurant, but the person who taps it may work at
 * several and be looking at another one. This makes the push's restaurant the
 * active one (the same cookie the sidebar switcher sets) and only then sends
 * them on to the section, so the chat or booking they were told about is the
 * one on screen. Every push URL goes through here (lib/push/send.ts).
 *
 * The destination is also fitted to the role: a host has no dashboard inbox,
 * so a chat opens in the chats app instead of bouncing off requireManager.
 *
 * Signed out: the target is kept in a short-lived cookie so the login lands
 * there instead of on the role's home.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get('t');
  const to = safePath(req.nextUrl.searchParams.get('to'));
  const cookieStore = await cookies();

  const user = await loadUser();
  if (!user) {
    cookieStore.set('kuik_next', req.nextUrl.pathname + req.nextUrl.search, { path: '/', maxAge: 60 * 10, sameSite: 'lax', httpOnly: true });
    return go('/login');
  }

  const memberships = await getMemberships(user.id);
  const membership = tenantId ? memberships.find((m) => m.tenant.id === tenantId) : undefined;
  if (membership) {
    cookieStore.set('kuik_tenant', membership.tenant.id, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  }

  return go(destinationFor(to, membership?.role ?? null));
}

/**
 * A redirect by path alone. Behind Render's proxy `req.url` is the internal
 * address (localhost:10000), so an absolute URL built from it sends people
 * nowhere; a relative Location is resolved by the browser against the public
 * address it actually asked for — kuik.mx, app.kuik.mx or localhost alike.
 */
function go(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

/** Same-origin paths only: "/whatsapp/inbox?c=…" yes, "https://…" or "//evil" no. */
function safePath(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/dashboard';
  return raw;
}

const MANAGERS: MemberRole[] = ['owner', 'manager'];

function destinationFor(path: string, role: MemberRole | null): string {
  // The dashboard inbox is manager-only; everyone else who gets chat pushes
  // (a host) has the chats app, which opens the same conversation.
  if (path.startsWith('/whatsapp/inbox') && role && !MANAGERS.includes(role)) {
    const c = new URL(path, 'http://x').searchParams.get('c');
    return c ? `/chats?c=${encodeURIComponent(c)}` : '/chats';
  }
  return path;
}
