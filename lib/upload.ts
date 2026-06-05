'use client';

import imageCompression from 'browser-image-compression';
import { createClient } from '@/lib/supabase/client';

/**
 * Compresses an image and uploads it to the public `media` bucket under the
 * tenant's folder. Returns the public URL.
 *
 * @param folder  logical subfolder: 'products' | 'banners' | 'logos' | 'backgrounds'
 */
export async function uploadImage(
  file: File,
  tenantId: string,
  folder: string,
): Promise<string> {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.6,
    maxWidthOrHeight: 1280,
    useWebWorker: true,
  });

  const supabase = createClient();
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const path = `${tenantId}/${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('media')
    .upload(path, compressed, { cacheControl: '3600', upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Uploads an arbitrary file (e.g. a PDF menu) as-is to the public `media`
 * bucket, with no compression. Returns the public URL.
 */
export async function uploadFile(
  file: File,
  tenantId: string,
  folder: string,
): Promise<string> {
  const supabase = createClient();
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const path = `${tenantId}/${folder}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage
    .from('media')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });
  if (error) throw error;

  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
}
