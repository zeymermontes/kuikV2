'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { uploadImage } from '@/lib/upload';
import { CutoutSheet } from './CutoutSheet';

/** SVG and GIF are stored as they are; there is nothing to cut. */
const PASSTHROUGH = /svg|gif/;

export function ImageUploader({
  value,
  tenantId,
  folder,
  onChange,
  shape = 'square',
  cutout = false,
}: {
  value: string | null;
  tenantId: string;
  folder: string;
  onChange: (url: string | null) => void;
  shape?: 'square' | 'wide' | 'circle';
  /** After an upload, offer the photo with its background removed (product photos). */
  cutout?: boolean;
}) {
  const t = useTranslations('menuEditor');
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [cutoutOf, setCutoutOf] = useState<{ file: File; url: string } | null>(null);

  const wide = shape === 'wide';
  const sizeClass = wide
    ? 'h-28 w-full'
    : shape === 'circle'
      ? 'h-24 w-24 rounded-full'
      : 'h-24 w-24 rounded-xl';

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const url = await uploadImage(file, tenantId, folder);
      onChange(url);
      // The original is in place already; the cut, if taken, replaces it.
      if (cutout && !PASSTHROUGH.test(file.type)) setCutoutOf({ file, url });
    } catch {
      // surfaced minimally; upload errors are rare and retryable
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={wide ? 'flex flex-col gap-2' : 'flex items-center gap-3'}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-neutral-300 bg-neutral-50 text-neutral-400 ${sizeClass}`}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : value ? (
          <Image src={value} alt="" fill className="object-cover" />
        ) : (
          <ImagePlus className="h-6 w-6" />
        )}
      </button>

      <div className={`flex gap-3 text-sm ${wide ? 'flex-row items-center' : 'flex-col gap-1'}`}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="font-medium text-neutral-700 hover:underline"
        >
          {t('uploadImage')}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="flex items-center gap-1 text-neutral-400 hover:text-red-500"
          >
            <X className="h-3.5 w-3.5" /> {t('removeImage')}
          </button>
        )}
      </div>

      {cutoutOf && (
        <CutoutSheet
          file={cutoutOf.file}
          src={cutoutOf.url}
          tenantId={tenantId}
          folder={folder}
          onDone={(url) => {
            setCutoutOf(null);
            if (url) onChange(url);
          }}
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
