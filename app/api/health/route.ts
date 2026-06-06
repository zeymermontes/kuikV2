// Dependency-free health check for Render. Returns 200 immediately without
// touching Supabase, so deploys never fail because the landing/DB is slow.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true });
}
