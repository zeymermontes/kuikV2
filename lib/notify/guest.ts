import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getNotifier } from './index';
import { renderNotification } from './messages';
import type { NotificationKind } from './types';

/** What a screen needs to know after a note to the diner was attempted. */
export interface GuestNotice {
  status: 'sent' | 'queued' | 'skipped' | 'failed';
  /** A one-tap wa.me link when a human still has to press send. */
  href?: string;
  notificationId?: string;
}

/**
 * Tell the diner one thing about their booking — rendered in the
 * restaurant's language, sent on whatever channel this restaurant has, and
 * recorded in the outbox so the button and the automatic send never say two
 * different things. One row per (reservation, kind): repeating rewrites it.
 */
export async function notifyGuest(params: {
  tenant: { id: string; name: string; locale: string };
  reservation: {
    id: string; customer_name: string; phone: string | null; party_size: number; date: string; time: string;
    whatsapp_conversation_id?: string | null;
  };
  kind: NotificationKind;
  minutes?: number | null;
}): Promise<GuestNotice> {
  const { tenant, reservation, kind } = params;
  const body = renderNotification(kind, tenant.locale, {
    restaurant: tenant.name,
    name: reservation.customer_name,
    party: reservation.party_size,
    date: reservation.date,
    time: reservation.time,
    minutes: params.minutes ?? null,
  });

  const input = { tenant, reservation, kind, body, minutes: params.minutes ?? null } as const;
  const notifier = await getNotifier(input);
  const result = await notifier.send(input);
  if (result.status === 'skipped') return { status: 'skipped' };

  const supabase = createAdminClient();
  const { data: note } = await supabase
    .from('reservation_notifications')
    .upsert(
      {
        tenant_id: tenant.id,
        reservation_id: reservation.id,
        kind,
        channel: result.href ? 'manual_wa' : notifier.channel,
        status: result.status === 'sent' ? 'sent' : result.status === 'failed' ? 'failed' : 'queued',
        body,
        provider_id: result.providerId ?? null,
        error: result.error ?? null,
        sent_at: result.status === 'sent' ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'reservation_id,kind' },
    )
    .select('id')
    .maybeSingle();

  return {
    status: result.status,
    href: result.href,
    notificationId: (note as { id: string } | null)?.id,
  };
}
