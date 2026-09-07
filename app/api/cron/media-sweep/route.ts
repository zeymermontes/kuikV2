import { NextResponse, type NextRequest } from 'next/server';
import { sweepMedia } from '@/lib/media/sweep';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Weekly: delete media nobody references any more (lib/media/sweep.ts).
 * Protected by CRON_SECRET like the other crons; `?dry=1` only reports.
 *
 * Render cron command: curl -H "Authorization: Bearer $CRON_SECRET" \
 *   https://app.kuik.mx/api/cron/media-sweep
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const dryRun = req.nextUrl.searchParams.get('dry') === '1';
  try {
    const report = await sweepMedia({ dryRun });
    return NextResponse.json({ ok: true, ...report, orphans: report.orphans.length, sample: report.orphans.slice(0, 20) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}
