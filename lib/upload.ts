'use client';

import imageCompression from 'browser-image-compression';
import { createClient } from '@/lib/supabase/client';

// What may go into the public `media` bucket from the dashboard. The bucket's
// policies (migration 0081) enforce the same limits server-side: a tenant's
// own folder, these extensions, 15 MB at most. Here is where a file is made
// small first: a photo becomes a WebP of at most 0.6 MB and 1280 px, which is
// what a phone menu needs and a fraction of what a camera produces.

/** Bigger than this is refused before decoding: a phone would run out of memory compressing it. */
const IMAGE_INPUT_MAX = 25 * 1024 * 1024;
/** SVG and GIF are uploaded as they are (rasterising them would lose the vector or the animation). */
const PASSTHROUGH_TYPES = new Set(['image/svg+xml', 'image/gif']);
const PASSTHROUGH_MAX = 2 * 1024 * 1024;
/** Other files (a PDF menu, a font, a song): the bucket's own cap. */
const FILE_MAX = 15 * 1024 * 1024;
const FILE_EXTENSIONS = new Set(['pdf', 'woff2', 'woff', 'ttf', 'otf', 'mp3']);

export class UploadError extends Error {
  constructor(public readonly code: 'not_image' | 'too_large' | 'unsupported') {
    super(code);
  }
}

const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase();

/**
 * Compresses an image to WebP and uploads it to the public `media` bucket
 * under the tenant's folder. Returns the public URL.
 *
 * @param folder  logical subfolder: 'products' | 'banners' | 'logos' | 'backgrounds' | 'imported'
 */
export async function uploadImage(file: File, tenantId: string, folder: string): Promise<string> {
  if (!file.type.startsWith('image/')) throw new UploadError('not_image');
  if (file.size > IMAGE_INPUT_MAX) throw new UploadError('too_large');

  let body: Blob = file;
  let ext: string;
  let contentType: string;
  if (PASSTHROUGH_TYPES.has(file.type)) {
    if (file.size > PASSTHROUGH_MAX) throw new UploadError('too_large');
    ext = file.type === 'image/gif' ? 'gif' : 'svg';
    contentType = file.type;
  } else {
    body = await imageCompression(file, {
      maxSizeMB: 0.6,
      maxWidthOrHeight: 1280,
      useWebWorker: true,
      fileType: 'image/webp',
      initialQuality: 0.85,
    });
    ext = 'webp';
    contentType = 'image/webp';
  }

  const supabase = createClient();
  const path = `${tenantId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, body, { cacheControl: '3600', upsert: false, contentType });
  if (error) throw error;

  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Uploads an image the dashboard already prepared (a WebP drawn on a canvas,
 * say) without compressing it again. Returns the public URL.
 */
export async function uploadBlob(blob: Blob, tenantId: string, folder: string, ext: 'webp' | 'png'): Promise<string> {
  if (blob.size > FILE_MAX) throw new UploadError('too_large');
  const supabase = createClient();
  const path = `${tenantId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, blob, { cacheControl: '3600', upsert: false, contentType: `image/${ext}` });
  if (error) throw error;
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl;
}

/**
 * Uploads a non-image file (a PDF menu, a font, a song) as-is to the public
 * `media` bucket. Returns the public URL.
 */
export async function uploadFile(file: File, tenantId: string, folder: string): Promise<string> {
  const ext = extOf(file.name);
  if (!FILE_EXTENSIONS.has(ext)) throw new UploadError('unsupported');
  if (file.size > FILE_MAX) throw new UploadError('too_large');

  const supabase = createClient();
  const path = `${tenantId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
}
