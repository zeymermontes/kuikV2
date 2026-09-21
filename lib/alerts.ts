import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { MemberRole } from '@/lib/database.types';
import { sendToTenant, type PushPayload } from '@/lib/push/send';
import { pendingCounts } from '@/lib/pending-counts';

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
  | 'customer_reply'
  | 'flow_notify';

export interface StaffAlertText {
  title: string;
  body: string;
}

/** The app icon's number: everything waiting for a person, whichever product. */
export async function pendingBadge(tenantId: string): Promise<number> {
  const c = await pendingCounts(tenantId);
  return c.bookings + c.chats;
}

export async function alertStaff(params: {
  tenantId: string;
  roles: MemberRole[];
  /**
   * Address it to one person instead of the roles: the human a diner is
   * answering. The roles then only say who hears it if that person is no
   * longer on the team.
   */
  userId?: string | null;
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
  const userId = params.userId ? await memberOrNull(supabase, params.tenantId, params.userId) : null;
  await supabase
    .from('staff_alerts')
    .insert({
      tenant_id: params.tenantId,
      kind: params.kind,
      roles: params.roles,
      ...(userId ? { user_id: userId } : {}),
      title_es: params.es.title,
      body_es: params.es.body,
      title_en: params.en.title,
      body_en: params.en.body,
      url: params.url ?? null,
      tag: params.tag ?? null,
    })
    .then(() => {}, () => {});

  await sendToTenant(params.tenantId, userId ? { userIds: [userId] } : params.roles, (locale) => {
    const t = locale === 'en' ? params.en : params.es;
    return { title: t.title, body: t.body, tag: params.tag, url: params.url, ...params.push };
  }).catch(() => {});
}

/** The person, if they still work here; otherwise the alert falls back to the roles. */
async function memberOrNull(supabase: ReturnType<typeof createAdminClient>, tenantId: string, userId: string): Promise<string | null> {
  const { data } = await supabase.from('tenant_members').select('user_id').eq('tenant_id', tenantId).eq('user_id', userId).maybeSingle();
  return data ? userId : null;
}
