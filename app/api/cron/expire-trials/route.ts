import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Daily cron (Render Cron Job). Flips trials/active subscriptions whose paid
 * window has lapsed to `past_due`. Protected by CRON_SECRET.
 *
 * Render cron command: curl -H "Authorization: Bearer $CRON_SECRET" \
 *   https://app.kuik.mx/api/cron/expire-trials
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Expired trials with no future paid period → past_due.
  const { data: expired } = await supabase
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: now })
    .eq('status', 'trialing')
    .lt('trial_ends_at', now)
    .select('tenant_id');

  // Active subs whose paid period ended and weren't renewed → past_due.
  const { data: lapsed } = await supabase
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: now })
    .eq('status', 'active')
    .lt('current_period_end', now)
    .select('tenant_id');

  return NextResponse.json({
    ok: true,
    expiredTrials: expired?.length ?? 0,
    lapsed: lapsed?.length ?? 0,
  });
}
