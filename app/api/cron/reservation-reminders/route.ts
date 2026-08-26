import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getNotifier, renderNotification } from '@/lib/notify';
import { sendToTenant } from '@/lib/push/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Remind diners about tomorrow's table.
 *
 * Runs HOURLY with a one-hour window, because a daily job cannot say "24 hours
 * before" for a booking at an arbitrary time. `claim_due_reminders` does the
 * window arithmetic in pure UTC — reservations.starts_at is a real timestamptz
 * derived from each tenant's own timezone — and claims rows through a unique
 * constraint, so overlapping runs, retries and redeploys are all harmless.
 */
type Claim = {
  notification_id: string;
  reservation_id: string;
  tenant_id: string;
  customer_name: string;
  phone: string;
  party_size: number;
  date: string;
  time: string;
  tenant_name: string;
  tenant_locale: string;
};

export async function GET(req: NextRequest) {
  // Stricter than app/api/cron/expire-trials/route.ts, which skips the check
  // entirely when the env var is unset — an open endpoint by omission.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('claim_due_reminders', { p_channel: 'manual_wa' });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const claims = (data ?? []) as Claim[];
  if (claims.length === 0) return NextResponse.json({ ok: true, claimed: 0, sent: 0 });

  let sent = 0;
  const staffNudges = new Map<string, number>();

  for (const c of claims) {
    const body = renderNotification('reminder_24h', c.tenant_locale, {
      restaurant: c.tenant_name,
      name: c.customer_name,
      party: c.party_size,
      date: c.date,
      time: c.time,
    });

    const input = {
      tenant: { id: c.tenant_id, name: c.tenant_name, locale: c.tenant_locale },
      reservation: {
        id: c.reservation_id,
        customer_name: c.customer_name,
        phone: c.phone,
        party_size: c.party_size,
        date: c.date,
        time: c.time,
      },
      kind: 'reminder_24h' as const,
      body,
    };

    const notifier = await getNotifier(input);
    const result = await notifier.send(input);

    await supabase
      .from('reservation_notifications')
      .update({
        channel: notifier.channel,
        body,
        status: result.status === 'sent' ? 'sent' : result.status === 'failed' ? 'failed' : 'queued',
        provider_id: result.providerId ?? null,
        error: result.error ?? null,
        sent_at: result.status === 'sent' ? new Date().toISOString() : null,
      })
      .eq('id', c.notification_id);

    if (result.status === 'sent') {
      sent++;
    } else {
      // Nobody can send this automatically yet, so nudge the staff instead and
      // let them tap it out. Once a tenant has an approved WhatsApp template
      // the notifier goes automatic and this branch stops firing — with no
      // change to this file.
      staffNudges.set(c.tenant_id, (staffNudges.get(c.tenant_id) ?? 0) + 1);
    }
  }

  await Promise.all(
    [...staffNudges].map(([tenantId, count]) =>
      sendToTenant(tenantId, ['owner', 'manager', 'cashier', 'host'], (locale) =>
        locale === 'en'
          ? {
              title: 'Reminders to send',
              body: `${count} ${count === 1 ? 'diner is' : 'diners are'} booked for tomorrow.`,
              tag: 'reminders',
              url: '/reservations',
            }
          : {
              title: 'Recordatorios por enviar',
              body: `${count} ${count === 1 ? 'comensal tiene' : 'comensales tienen'} reservación para mañana.`,
              tag: 'reminders',
              url: '/reservations',
            },
      ).catch(() => {}),
    ),
  );

  return NextResponse.json({ ok: true, claimed: claims.length, sent });
}
