import { NextResponse } from 'next/server';
import { tryTenant } from '@/lib/auth';
import { revalidateTenant } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Drop the cached public pages of the caller's restaurant. The register
 * calls it after a sold-out change reaches the server (lib/pos/sync.ts); the
 * dashboard's own actions revalidate inline. Any signed-in member may call
 * it: it only refreshes what is public anyway.
 */
export async function POST() {
  const ctx = await tryTenant();
  if (!ctx) return NextResponse.json({ ok: false }, { status: 401 });
  revalidateTenant(ctx.tenant.subdomain, ctx.tenant.custom_domain);
  return NextResponse.json({ ok: true });
}
