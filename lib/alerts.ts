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
