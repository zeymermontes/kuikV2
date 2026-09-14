import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MemberRole } from '@/lib/database.types';
import { sendToTenant, type PushPayload } from '@/lib/push/send';

/**
 * "Something needs a person" — said twice, on purpose: a row in
 * staff_alerts, which every open Kuik screen hears over Realtime (a chime
 * and a toast, components/StaffAlerts.tsx), and a push for the phones that
 * are not looking. Best-effort both ways: the event that caused it (a
 * booking, a handoff) must never fail because nobody could be told.
 */

export type StaffAlertKind =
  | 'reservation_new'
  | 'reservation_confirmed'
  | 'reservation_cancelled'
  | 'reservation_changed'
  | 'handoff'
  | 'flow_notify';

export interface StaffAlertText {
  title: string;
  body: string;
}

/**
 * What the app icon should count for this restaurant: booking requests
 * waiting for a yes or no, guests asking to cancel or who cancelled unseen,
 * and WhatsApp chats parked for a person. Same arithmetic as the host's
 * bell, so the phone and the stand agree.
 */
export async function pendingBadge(tenantId: string): Promise<number> {
  const supabase = createAdminClient();
  const [{ count: bookings }, { count: chats }] = await Promise.all([
    supabase
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .or('status.eq.pending,and(status.in.(confirmed,waiting,notified),cancel_requested_at.not.is.null),and(status.eq.cancelled,cancelled_by.eq.guest,cancel_seen_at.is.null)')
      .gte('starts_at', new Date().toISOString()),
    supabase
      .from('whatsapp_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('handoff_at', 'is', null),
  ]);
  return (bookings ?? 0) + (chats ?? 0);
}

export async function alertStaff(params: {
  tenantId: string;
  roles: MemberRole[];
  kind: StaffAlertKind;
  es: StaffAlertText;
  en: StaffAlertText;
  url?: string;
  /** Same tag replaces an earlier push instead of stacking. */
  tag?: string;
  /** Extra push fields: quick actions, data for the service worker. */
  push?: Pick<PushPayload, 'actions' | 'data' | 'requireInteraction'>;
}): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from('staff_alerts')
    .insert({
      tenant_id: params.tenantId,
      kind: params.kind,
      roles: params.roles,
      title_es: params.es.title,
      body_es: params.es.body,
      title_en: params.en.title,
      body_en: params.en.body,
      url: params.url ?? null,
      tag: params.tag ?? null,
    })
    .then(() => {}, () => {});

  await sendToTenant(params.tenantId, params.roles, (locale) => {
    const t = locale === 'en' ? params.en : params.es;
    return { title: t.title, body: t.body, tag: params.tag, url: params.url, ...params.push };
  }).catch(() => {});
}
