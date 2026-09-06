import { NextResponse } from 'next/server';
import { getAppReleases } from '@/lib/apps/releases';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** The native apps' latest versions, for the in-app update banner (components/ShellUpdateBanner.tsx). */
export async function GET() {
  const releases = await getAppReleases();
  return NextResponse.json(releases, {
    headers: { 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' },
  });
}
