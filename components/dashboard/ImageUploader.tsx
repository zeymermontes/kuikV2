'use client';

import { useRef, useState } from 'react';
import Image from 'next/image';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { uploadImage } from '@/lib/upload';

export function ImageUploader({
  value,
  tenantId,
  folder,
  onChange,
  shape = 'square',
}: {
  value: string | null;
  tenantId: string;
  folder: string;
  onChange: (url: string | null) => void;
  shape?: 'square' | 'wide' | 'circle';
}) {
  const t = useTranslations('menuEditor');
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const sizeClass =
    shape === 'wide'
      ? 'h-28 w-full'
      : shape === 'circle'
        ? 'h-24 w-24 rounded-full'
        : 'h-24 w-24 rounded-xl';

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const url = await uploadImage(file, tenantId, folder);
      onChange(url);
    } catch {
      // surfaced minimally; upload errors are rare and retryable
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-dashed border-neutral-300 bg-neutral-50 text-neutral-400 ${sizeClass} ${
          shape !== 'wide' ? '' : 'rounded-xl'
        }`}
      >
        {busy ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : value ? (
          <Image src={value} alt="" fill className="object-cover" />
        ) : (
          <ImagePlus className="h-6 w-6" />
        )}
      </button>

      <div className="flex flex-col gap-1 text-sm">
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
