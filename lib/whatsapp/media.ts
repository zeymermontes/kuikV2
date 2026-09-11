import 'server-only';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { getToken } from './credentials';
import { GRAPH_VERSION } from './client';

/**
 * Inbound media — a photo, a sticker, a voice note — kept where the staff
 * chat can show it. Files land in the public `media` bucket under the
 * tenant's own `whatsapp/` folder; the sweep leaves them alone as long as a
 * whatsapp_messages row points at them (media_referenced_paths() scans
 * every table's text for bucket URLs, so no list to keep up to date).
 */

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/wav': 'wav',
};

function extFor(mime: string | null): string {
  const base = (mime ?? '').split(';')[0].trim().toLowerCase();
  return EXT[base] ?? (base.startsWith('image/') ? 'bin' : base.startsWith('audio/') ? 'ogg' : 'bin');
}

/** Upload the bytes; returns the public URL, or null when storage refused. */
export async function storeInboundMedia(tenantId: string, bytes: Buffer, mime: string | null): Promise<string | null> {
  const supabase = createAdminClient();
  const path = `${tenantId}/whatsapp/${randomUUID()}.${extFor(mime)}`;
  const contentType = (mime ?? 'application/octet-stream').split(';')[0].trim();
  const { error } = await supabase.storage
    .from('media')
    .upload(path, bytes, { cacheControl: '31536000', upsert: false, contentType });
  if (error) {
    console.error('[whatsapp] media upload failed', error.message);
    return null;
  }
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

/**
 * Cloud API media arrives as an id; the bytes are two authenticated hops
 * away (id → short-lived URL → file). Best-effort: null on any failure and
 * the message is stored without its file.
 */
export async function downloadCloudMedia(
  phoneNumberId: string,
  mediaId: string,
): Promise<{ bytes: Buffer; mime: string | null } | null> {
  try {
    const token = await getToken(phoneNumberId);
    if (!token) return null;
    const meta = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!meta.ok) return null;
    const { url, mime_type } = (await meta.json()) as { url?: string; mime_type?: string };
    if (!url) return null;
    const file = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    if (!file.ok) return null;
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length > 8 << 20) return null;
    return { bytes, mime: mime_type ?? file.headers.get('content-type') };
  } catch {
    return null;
  }
}
