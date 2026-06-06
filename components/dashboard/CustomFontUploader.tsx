'use client';

import { useRef, useState } from 'react';
import { Type, Loader2, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { uploadFile } from '@/lib/upload';

/** Upload a custom font file (woff2/woff/ttf/otf) for the menu. */
export function CustomFontUploader({
  value,
  name,
  tenantId,
  onChange,
}: {
  value: string | null;
  name: string | null;
  tenantId: string;
  onChange: (url: string | null, name: string | null) => void;
}) {
  const t = useTranslations('design');
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const url = await uploadFile(file, tenantId, 'fonts');
      onChange(url, file.name);
    } catch {
      // upload errors are rare and retryable
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Type className="h-4 w-4" />}
          {value ? t('replaceFont') : t('uploadFont')}
        </button>
        {value && (
          <span className="flex items-center gap-2 text-sm text-neutral-600">
            <span className="max-w-[10rem] truncate font-medium">{name || t('customFont')}</span>
            <button
              type="button"
              onClick={() => onChange(null, null)}
              className="flex items-center gap-1 text-neutral-400 hover:text-red-500"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
      <p className="mt-1.5 text-xs text-neutral-400">
        {value ? t('customFontActive') : t('customFontHint')}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf"
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
