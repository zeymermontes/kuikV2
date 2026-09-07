// Dependency-free health check for Render. Returns 200 immediately without
// touching Supabase, so deploys never fail because the landing/DB is slow.
// `commit` says which build answers (Render sets RENDER_GIT_COMMIT), so a
// deploy can be confirmed from outside without a dashboard.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ ok: true, commit: process.env.RENDER_GIT_COMMIT?.slice(0, 7) ?? null });
}
