import { NextResponse } from 'next/server';
import { getAppReleases } from '@/lib/apps/releases';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The native apps' latest and minimum versions, for the in-app update gate (components/ShellUpdateBanner.tsx). */
export async function GET() {
  const releases = await getAppReleases({ fresh: true });
  return NextResponse.json(releases, {
    // Short: a mandatory update should reach every device within minutes, not hours.
    headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' },
  });
}
