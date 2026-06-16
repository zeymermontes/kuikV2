import { createAdminClient } from '@/lib/supabase/admin';
import { contentTypeFor, LANDING_DIR } from '@/lib/landing';

/**
 * Serves a tenant's uploaded custom-landing files from the `media` bucket.
 *
 * Why this proxy exists: Supabase Storage forces uploaded HTML to be served as
 * text/plain (anti-XSS hardening on *.supabase.co), so an iframe pointed at the
 * raw storage URL would show the page source instead of rendering it. Here we
 * stream the bytes and set the content-type from the file extension ourselves —
 * so index.html is served as text/html and the page renders.
 *
 * Security is unchanged: the page is embedded in a sandboxed iframe WITHOUT
 * allow-same-origin, so its JS runs in an opaque origin and can't reach our
 * session, cookies, or APIs — regardless of which host serves the bytes.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ tenantId: string; path: string[] }> },
) {
  const { tenantId, path } = await params;
  const rel = path.join('/');

  // Block path traversal and stray dotfiles.
  if (!rel || rel.includes('..') || rel.split('/').some((s) => s.startsWith('.'))) {
    return new Response('Not found', { status: 404 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase.storage
    .from('media')
    .download(`${tenantId}/${LANDING_DIR}/${rel}`);
  if (error || !data) return new Response('Not found', { status: 404 });

  return new Response(await data.arrayBuffer(), {
    headers: {
      'content-type': contentTypeFor(rel),
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}
