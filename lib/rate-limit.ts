import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Fixed-window rate limiting backed by one small Postgres table.
 *
 * Kuik's public routes (/api/reservation, /api/order, /api/track, /api/loyalty)
 * are service-role, unauthenticated and were entirely unbounded — /api/reservation
 * would insert unlimited rows given only a name, a date and a time. Adding a bot
 * that also books tables makes that more attractive to abuse, so this closes it.
 *
 * A fixed window (rather than a sliding one) is deliberate: it is a single
 * atomic upsert, needs no Redis, and the burst it permits at a window boundary
 * is irrelevant at these limits.
 */

export interface RateLimitResult {
  ok: boolean;
  /** Hits so far in this window, including the current one. */
  count: number;
}

/**
 * Count one hit against `bucket`. Fails OPEN: if the limiter itself errors we
 * let the request through rather than taking the feature down with it.
 */
export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('rate_limit_hit', {
      p_bucket: bucket,
      p_window_seconds: windowSeconds,
    });
    if (error || typeof data !== 'number') return { ok: true, count: 0 };
    return { ok: data <= limit, count: data };
  } catch {
    return { ok: true, count: 0 };
  }
}

/**
 * The caller's IP, as far as it can be trusted. Render sits behind a proxy, so
 * x-forwarded-for's FIRST entry is the client; later entries are proxies.
 * Spoofable in principle, which is why it is only ever one of several buckets.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Bucket key helper — keeps the `scope:id:window` shape consistent. */
export function bucketKey(scope: string, id: string, windowSeconds: number): string {
  const slot = Math.floor(Date.now() / 1000 / windowSeconds);
  return `${scope}:${id}:${slot}`;
}
