import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processEvents } from '@/lib/whatsapp/inbound';
import { runFlowTimers } from '@/lib/whatsapp/flows/timers';
import { sendToTenant } from '@/lib/push/send';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Housekeeping for the WhatsApp subsystem.
 *
 * The important job is the first one: the webhook acks fast and works in
 * `after()`, so anything killed by a deploy or an OOM is still sitting there as
 * 'pending'. This is what makes that design safe rather than lossy.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createAdminClient();

  // 1. Re-run events that never finished. Capped attempts so a permanently
  //    broken payload doesn't spin forever.
  const { data: stuck } = await supabase
    .from('whatsapp_events')
    .select('id')
    .in('status', ['pending', 'error'])
    .lt('attempts', 5)
    .lt('received_at', new Date(Date.now() - 60_000).toISOString())
    .limit(100);

  const ids = ((stuck ?? []) as { id: string }[]).map((r) => r.id);
  if (ids.length > 0) {
    await supabase.from('whatsapp_events').update({ status: 'pending' }).in('id', ids);
    await processEvents(ids);
  }

  // 2. Coexistence drops a number after 14 days without the Business app being
  //    opened. Warn at day 11, while it can still be saved.
  const elevenDaysAgo = new Date(Date.now() - 11 * 86_400_000).toISOString();
  const { data: idle } = await supabase
    .from('whatsapp_numbers')
    .select('tenant_id, display_phone_number, last_inbound_at, last_outbound_at')
    .eq('status', 'connected')
    .eq('mode', 'coexistence')
    .or(`last_inbound_at.lt.${elevenDaysAgo},last_inbound_at.is.null`);

  const warned = new Set<string>();
  for (const row of (idle ?? []) as { tenant_id: string; display_phone_number: string }[]) {
    if (warned.has(row.tenant_id)) continue;
    warned.add(row.tenant_id);
    await sendToTenant(row.tenant_id, ['owner', 'manager'], (locale) =>
      locale === 'en'
        ? {
            title: 'Open WhatsApp on your phone',
            body: `${row.display_phone_number} will disconnect if the Business app isn't opened in the next few days.`,
            tag: 'wa-idle',
            url: '/whatsapp',
          }
        : {
            title: 'Abre WhatsApp en tu celular',
            body: `${row.display_phone_number} se va a desconectar si no abres la app de Business en los próximos días.`,
            tag: 'wa-idle',
            url: '/whatsapp',
          },
    ).catch(() => {});
  }

  // 3. Flow timers: nudge diners who went quiet mid-flow, close out the ones
  //    who never came back. Also purges runs older than 90 days.
  const timers = await runFlowTimers(supabase);

  // 4. Prune. Raw payloads can hold anything a customer typed, so they should
  //    not accumulate indefinitely.
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  await supabase.from('whatsapp_events').delete().eq('status', 'done').lt('received_at', thirtyDaysAgo);
  await supabase.from('rate_limits').delete().lt('expires_at', new Date().toISOString());

  return NextResponse.json({
    ok: true, reprocessed: ids.length, idleWarned: warned.size,
    nudged: timers.nudged, closedRuns: timers.closed,
  });
}
