import { createAdminClient } from '@/lib/supabase/admin';
import { contentTypeFor, LANDING_DIR } from '@/lib/landing';
import { getLandingVars, applyLandingVars, isSubstitutable } from '@/lib/landing-vars';
import { LANDING_BRIDGE } from '@/lib/landing-bridge';

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

  const contentType = contentTypeFor(rel);

  // Text files get `{{variable}}` filled in from the restaurant's current
  // settings. That is what lets a phone number change in Kuik without anyone
  // rebuilding and re-uploading the ZIP.
  if (isSubstitutable(rel)) {
    const vars = await getLandingVars(tenantId);
    let body = applyLandingVars(await data.text(), vars);

    // HTML also gets the bridge script, so the page can ask the app to open the
    // reservation sheet. The iframe is sandboxed without allow-same-origin, so
    // postMessage is the only channel it has — a fetch or a direct call would
    // be blocked by the opaque origin.
    if (contentType.startsWith('text/html')) {
      body = body.includes('</body>')
        ? body.replace('</body>', `${LANDING_BRIDGE}</body>`)
        : body + LANDING_BRIDGE;
    }

    return new Response(body, {
      headers: {
        'content-type': contentType,
        // Shorter than the assets: these carry live settings now.
        'cache-control': 'public, max-age=60',
        'x-content-type-options': 'nosniff',
      },
    });
  }

  return new Response(await data.arrayBuffer(), {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}
