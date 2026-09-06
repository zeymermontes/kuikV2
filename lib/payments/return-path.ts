/**
 * Where the guest lands after checkout. The cart sends the path it is on (the
 * menu lives at `/` for some restaurants and at `/menu` for the ones with a
 * landing page), and the gateway redirects there. Only a plain path on our own
 * host is accepted: no scheme, no host, no query, so a tampered request cannot
 * send a guest anywhere else.
 */
export function safeReturnPath(p: unknown): string {
  if (typeof p !== 'string' || p.length > 200) return '/';
  // Segments of letters, digits and a few safe marks; `.`/`..` segments are refused.
  if (!/^\/(?:(?!\.+(?:\/|$))[a-z0-9._~-]+(?:\/(?!\.+(?:\/|$))[a-z0-9._~-]+)*)?$/i.test(p)) return '/';
  return p;
}

/** Ten to fifteen digits, or null; a `+` prefix is kept. */
export function normalizePhone(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/[^\d+]/g, '');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) return null;
  return (s.startsWith('+') ? '+' : '') + digits;
}
