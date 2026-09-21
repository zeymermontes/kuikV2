import 'server-only';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MemberRole } from '@/lib/database.types';
import { fcmConfigured, sendFcm } from './fcm';
import { apnsConfigured, sendApns } from './apns';

/**
 * Outbound push to a restaurant's staff: web push to installed PWAs and
 * browsers; to the native phone app, FCM on Android (lib/push/fcm.ts) and
 * APNs on iOS (lib/push/apns.ts).
 *
 * Recipients are resolved at SEND time by joining tenant_members on role, so
 * removing someone from the team — or demoting them — stops their pushes
 * without anyone remembering to clean up a subscription table. A push can
 * also be addressed to specific people (`{ userIds }`), still checked
 * against tenant_members so a former member never hears from a restaurant.
 *
 * Every push knows which restaurant it belongs to. Its URL goes through
 * /open, which makes that restaurant the active one before showing the
 * section, so a tap lands on the right chat or booking even when the person
 * was looking at another of their restaurants. For people who work at more
 * than one, the title also names the restaurant.
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
  /** A dashboard path ("/whatsapp/inbox?c=…"). Rewritten to /open at send time. */
  url?: string;
  /** Android shows up to two; Safari/iOS reports maxActions 0 and ignores them. */
  actions?: { action: string; title: string }[];
  data?: Record<string, unknown>;
  /** Keep the notification on screen until the person acts on it (Android/desktop). */
  requireInteraction?: boolean;
  /** What the app icon should count: things still waiting for a person. */
  badge?: number;
}

/** Who should hear it: everyone in these roles, or exactly these people. */
export type PushRecipients = MemberRole[] | { userIds: string[] };

/**
 * The link a notification opens: switch to this restaurant, then go to `path`.
 * Handled by app/open/route.ts, which also checks the person belongs there.
 */
export function openUrl(tenantId: string, path: string): string {
  return `/open?t=${encodeURIComponent(tenantId)}&to=${encodeURIComponent(path)}`;
}

type Row = { id: string; endpoint: string; p256dh: string; auth: string; locale: string; user_id: string };

interface Audience {
  /** Members of this tenant who should hear it. */
  userIds: string[];
  /** Those among them who belong to more than one restaurant. */
  multi: Set<string>;
  tenantName: string | null;
}

type Admin = ReturnType<typeof createAdminClient>;

async function resolveAudience(supabase: Admin, tenantId: string, to: PushRecipients): Promise<Audience | null> {
  let q = supabase.from('tenant_members').select('user_id').eq('tenant_id', tenantId);
  q = Array.isArray(to) ? q.in('role', to) : q.in('user_id', to.userIds);
  const { data: members } = await q;
  const userIds = (members ?? []).map((m) => (m as { user_id: string }).user_id);
  if (userIds.length === 0) return null;

  const [{ data: all }, { data: tenant }] = await Promise.all([
    supabase.from('tenant_members').select('user_id').in('user_id', userIds),
    supabase.from('tenants').select('name').eq('id', tenantId).maybeSingle(),
  ]);
  const seen = new Map<string, number>();
  for (const m of (all ?? []) as { user_id: string }[]) seen.set(m.user_id, (seen.get(m.user_id) ?? 0) + 1);
  const multi = new Set([...seen].filter(([, n]) => n > 1).map(([id]) => id));
  return { userIds, multi, tenantName: (tenant as { name: string } | null)?.name ?? null };
}

/** The payload as one person's device should get it: the restaurant named where it matters, the URL made to switch to it. */
function decorate(payload: PushPayload, tenantId: string, audience: Audience, userId: string): PushPayload {
  const path = payload.url;
  const title = audience.multi.has(userId) && audience.tenantName ? `${audience.tenantName} · ${payload.title}` : payload.title;
  return {
    ...payload,
    title,
    url: path ? openUrl(tenantId, path) : undefined,
    data: { ...(payload.data ?? {}), tenantId, ...(path ? { path } : {}) },
  };
}

/**
 * Fire-and-forget. Never let a push failure take down the request that caused
 * it — a diner's booking must succeed even if nobody's phone can be reached.
 */
export async function sendToTenant(
  tenantId: string,
  to: PushRecipients,
  build: (locale: string) => PushPayload,
): Promise<void> {
  const web = ensureConfigured();
  const native = fcmConfigured() || apnsConfigured();
  if (!web && !native) return;
  if (!Array.isArray(to) && to.userIds.length === 0) return;

  const supabase = createAdminClient();
  const audience = await resolveAudience(supabase, tenantId, to);
  if (!audience) return;

  const payloadFor = (locale: string, userId: string) => decorate(build(locale), tenantId, audience, userId);

  await Promise.all([
    web ? sendWeb(supabase, tenantId, audience.userIds, payloadFor) : Promise.resolve(),
    native ? sendNative(supabase, tenantId, audience.userIds, payloadFor) : Promise.resolve(),
  ]);
}

type Build = (locale: string, userId: string) => PushPayload;

async function sendWeb(supabase: Admin, tenantId: string, userIds: string[], build: Build): Promise<void> {
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth, locale, user_id')
    .eq('tenant_id', tenantId)
    .in('user_id', userIds);

  const subs = (data ?? []) as Row[];
  if (subs.length === 0) return;

  const dead: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      const payload = build(sub.locale, sub.user_id);
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

async function sendNative(supabase: Admin, tenantId: string, userIds: string[], build: Build): Promise<void> {
  const { data } = await supabase
    .from('device_push_tokens')
    .select('token, platform, locale, user_id')
    .eq('tenant_id', tenantId)
    .in('user_id', userIds);
  const devices = (data ?? []) as { token: string; platform: 'ios' | 'android'; locale: string; user_id: string }[];
  if (devices.length === 0) return;

  const dead: string[] = [];
  await Promise.all(
    devices.map(async (d) => {
      try {
        const send = d.platform === 'ios' ? sendApns : sendFcm;
        if ((await send(d.token, build(d.locale, d.user_id))) === 'dead') dead.push(d.token);
      } catch {
        // A network blip is not a dead token; the next push tries again.
      }
    }),
  );
  // As for endpoints: a dead token is dead for every tenant the person works at.
  if (dead.length > 0) await supabase.from('device_push_tokens').delete().in('token', dead);
}
