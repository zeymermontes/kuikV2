import 'server-only';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MemberRole } from '@/lib/database.types';

/**
 * Outbound web push to a restaurant's staff.
 *
 * Recipients are resolved at SEND time by joining tenant_members on role, so
 * removing someone from the team — or demoting them — stops their pushes
 * without anyone remembering to clean up a subscription table.
 */

let configured = false;

/** Returns false when VAPID isn't configured, so callers can skip silently. */
function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:soporte@kuik.mx',
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Same tag replaces an earlier notification instead of stacking. */
  tag?: string;
  url?: string;
  /** Android shows up to two; Safari/iOS reports maxActions 0 and ignores them. */
  actions?: { action: string; title: string }[];
  data?: Record<string, unknown>;
}

type Row = { id: string; endpoint: string; p256dh: string; auth: string; locale: string };

/**
 * Fire-and-forget. Never let a push failure take down the request that caused
 * it — a diner's booking must succeed even if nobody's phone can be reached.
 */
export async function sendToTenant(
  tenantId: string,
  roles: MemberRole[],
  build: (locale: string) => PushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;

  const supabase = createAdminClient();

  const { data: members } = await supabase
    .from('tenant_members')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .in('role', roles);

  const userIds = (members ?? []).map((m) => (m as { user_id: string }).user_id);
  if (userIds.length === 0) return;

  const { data } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, locale')
    .eq('tenant_id', tenantId)
    .in('user_id', userIds);

  const subs = (data ?? []) as Row[];
  if (subs.length === 0) return;

  const dead: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      const payload = build(sub.locale);
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload),
          { TTL: 60 * 30 },
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // 404/410 mean the push service has retired this endpoint for good.
        if (status === 404 || status === 410) dead.push(sub.endpoint);
      }
    }),
  );

  if (dead.length > 0) {
    // Delete by endpoint, not by row: a dead endpoint is dead for every tenant
    // that person works at.
    await supabase.from('push_subscriptions').delete().in('endpoint', dead);
  }
}
